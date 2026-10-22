import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentAnswerView } from "@/components/agent/gen-ui";
import {
  composeAgentAnswerParts,
  extractAgentLensTargets,
  sanitizeAgentGenUiParts,
  toggleAgentShaHighlight,
  toggleAgentTipHighlight,
  type AgentGenUiPart,
} from "@/lib/agent/gen-ui";
import { linear } from "@/tests/fixtures/history";

describe("agent gen-UI sanitize", () => {
  test("keeps typed primitives and drops unknown / hostile fields", () => {
    const parts = sanitizeAgentGenUiParts([
      { type: "text", text: "Merged into main." },
      { type: "commit", sha: "abcdef1", label: "<script>" },
      { type: "branch", name: "feature/zoom", tipSha: "not-a-sha" },
      { type: "tag", name: "v1.2.0" },
      { type: "date", iso: "2026-04-05", label: "2026-04-05" },
      { type: "release_note", title: "Zoom gestures", body: "Pinch + ctrl-wheel." },
      { type: "parents", shas: ["abcdef1", "deadbeef", "!!!"] },
      { type: "list", items: [[{ type: "branch", name: "feature/a" }], "nope"] },
      { type: "iframe", src: "https://evil.example" },
      { type: "commit", sha: "short" },
    ]);

    expect(parts).toEqual([
      { type: "text", text: "Merged into main." },
      { type: "commit", sha: "abcdef1", label: "<script>" },
      { type: "branch", name: "feature/zoom" },
      { type: "tag", name: "v1.2.0" },
      { type: "date", iso: "2026-04-05", label: "2026-04-05" },
      { type: "release_note", title: "Zoom gestures", body: "Pinch + ctrl-wheel." },
      { type: "parents", shas: ["abcdef1", "deadbeef"] },
      { type: "list", items: [[{ type: "branch", name: "feature/a" }]] },
    ]);
  });

  test("rejects path-trick branch names", () => {
    expect(sanitizeAgentGenUiParts([{ type: "branch", name: "../etc/passwd" }])).toEqual([]);
    expect(sanitizeAgentGenUiParts([{ type: "branch", name: "/abs" }])).toEqual([]);
  });
});

describe("agent gen-UI compose + lens", () => {
  test("lifts markdown bullets and backtick entities into parts", () => {
    const tip = "aabbccddeeff00112233445566778899aabbccdd";
    const base = linear(3);
    const history = {
      commits: [
        { ...base.commits[0]!, sha: tip, parents: ["c1"] },
        ...base.commits.slice(1),
      ],
      refs: [
        { name: "HEAD", type: "head" as const, sha: tip },
        { name: "main", type: "branch" as const, sha: tip },
        { name: "feature/ref-badges", type: "branch" as const, sha: "c1" },
        { name: "v0.4.0", type: "tag" as const, sha: "c2" },
      ],
    };

    const parts = composeAgentAnswerParts(
      [
        "Recent merges into `main` landed as `aabbccd`.",
        "",
        "- `feature/ref-badges`",
        "- `feature/zoom-gestures`",
        "- `v0.4.0` on 2026-04-05",
      ].join("\n"),
      history,
    );

    expect(parts.some((part) => part.type === "branch" && part.name === "main")).toBe(true);
    // Tip SHA next to `main` is noise — stripped; standalone commit questions still lift SHAs.
    expect(parts.some((part) => part.type === "commit")).toBe(false);
    expect(parts.some((part) => part.type === "list")).toBe(true);

    const lens = extractAgentLensTargets(parts, history);
    expect(lens.branches).toContain("main");
    expect(lens.branches).toContain("feature/ref-badges");
  });

  test("strips tip SHA decoration next to branch pills in lists", () => {
    const develop = "37de000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const tipA = "6345400bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const tipB = "eac8000ccccccccccccccccccccccccccccccc";
    const base = linear(3);
    const history = {
      commits: [
        { ...base.commits[0]!, sha: tipA, parents: [develop] },
        { ...base.commits[1]!, sha: tipB, parents: [develop] },
        { ...base.commits[2]!, sha: develop, parents: [] },
      ],
      refs: [
        { name: "develop", type: "branch" as const, sha: develop },
        { name: "feature/perf-budget", type: "branch" as const, sha: tipA },
        {
          name: "feature/ai-branch-summaries-zdr-spike",
          type: "branch" as const,
          sha: tipB,
        },
      ],
    };

    const parts = composeAgentAnswerParts(
      [
        "Three branch tips are not reachable from `develop` (37de000):",
        "",
        "- `feature/perf-budget` · `6345400`",
        "- `feature/ai-branch-summaries-zdr-spike` · `eac8000`",
      ].join("\n"),
      history,
    );

    const list = parts.find((part) => part.type === "list");
    expect(list?.type).toBe("list");
    if (list?.type !== "list") throw new Error("expected list");
    for (const item of list.items) {
      expect(item.some((cell) => cell.type === "branch")).toBe(true);
      expect(item.some((cell) => cell.type === "commit")).toBe(false);
    }
    // Lead line keeps the branch; parenthetical tip SHA is dropped.
    const flat = parts.flatMap((part) =>
      part.type === "list" ? part.items.flat() : part.type === "release_note" ? [] : [part],
    );
    expect(flat.some((p) => p.type === "branch" && p.name === "develop")).toBe(true);
    expect(flat.some((p) => p.type === "commit")).toBe(false);
  });

  test("keeps standalone commit primitives when the answer is about a SHA", () => {
    const tip = "aabbccddeeff00112233445566778899aabbccdd";
    const base = linear(2);
    const history = {
      commits: [{ ...base.commits[0]!, sha: tip, parents: [] }, ...base.commits.slice(1)],
      refs: [{ name: "main", type: "branch" as const, sha: tip }],
    };
    const parts = composeAgentAnswerParts("Inspect tip `aabbccd`.", history);
    expect(parts.some((part) => part.type === "commit")).toBe(true);
    expect(parts.some((part) => part.type === "branch")).toBe(false);
  });

  test("prefers chronos-parts JSON fence when present", () => {
    const parts = composeAgentAnswerParts(
      [
        "ignore this prose",
        "```chronos-parts",
        JSON.stringify({
          parts: [
            { type: "text", text: "Consolidated." },
            {
              type: "list",
              items: [[{ type: "branch", name: "feature/keyboard-nav" }]],
            },
          ],
        }),
        "```",
      ].join("\n"),
    );
    expect(parts).toEqual([
      { type: "text", text: "Consolidated." },
      {
        type: "list",
        items: [[{ type: "branch", name: "feature/keyboard-nav" }]],
      },
    ]);
  });

  test("caps long bullet dumps and drops Notes essay headers", () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `- item-${i}`);
    const parts = composeAgentAnswerParts(
      ["Lead answer.", "", "Notes:", "", ...bullets].join("\n"),
    );
    const list = parts.find((part) => part.type === "list");
    expect(list?.type).toBe("list");
    if (list?.type !== "list") throw new Error("expected list");
    expect(list.items.length).toBeLessThanOrEqual(6);
    expect(
      list.items.some(
        (row) => row.length === 1 && row[0]?.type === "text" && row[0].text.startsWith("+"),
      ),
    ).toBe(true);
    expect(parts.every((part) => part.type !== "text" || !/^notes/i.test(part.text))).toBe(true);
  });
});

describe("agent gen-UI highlight toggle", () => {
  test("second click on the same SHA clears selection", () => {
    const full = "aabbccddeeff00112233445566778899aabbccdd";
    expect(toggleAgentShaHighlight(null, full)).toBe(full);
    expect(toggleAgentShaHighlight(full, full)).toBeNull();
    expect(toggleAgentShaHighlight(full, "aabbccd")).toBeNull();
    expect(toggleAgentShaHighlight("aabbccd", full)).toBeNull();
    expect(toggleAgentShaHighlight(full, "deadbeef")).toBe("deadbeef");
  });

  test("second click on the same branch tip clears trace", () => {
    const tip = "aabbccddeeff00112233445566778899aabbccdd";
    expect(toggleAgentTipHighlight(null, tip)).toBe(tip);
    expect(toggleAgentTipHighlight(tip, tip)).toBeNull();
    expect(toggleAgentTipHighlight(tip, "deadbeef")).toBe("deadbeef");
  });
});

describe("agent gen-UI registry render", () => {
  test("composes commit + branch + date + list via the registry", () => {
    const parts: AgentGenUiPart[] = [
      { type: "text", text: "Tip " },
      { type: "commit", sha: "abcdef1234567", label: "abcdef1" },
      { type: "text", text: " on " },
      { type: "branch", name: "develop", tipSha: "abcdef1234567" },
      { type: "text", text: " · " },
      { type: "date", iso: "2026-04-05", label: "2026-04-05" },
      {
        type: "list",
        items: [
          [{ type: "branch", name: "feature/keyboard-nav" }],
          [{ type: "tag", name: "v0.4.0" }],
        ],
      },
      { type: "release_note", title: "Zoom", body: "Pinch gestures." },
      { type: "parents", shas: ["1111111", "2222222"] },
    ];

    const html = renderToStaticMarkup(createElement(AgentAnswerView, { parts }));

    expect(html).toContain("abcdef1");
    expect(html).toContain("develop");
    expect(html).toContain("2026-04-05");
    expect(html).toContain("feature/keyboard-nav");
    expect(html).toContain("v0.4.0");
    expect(html).toContain("Zoom");
    expect(html).toContain("Pinch gestures.");
    expect(html).toContain("1111111");
    expect(html).toContain('data-kind="branch"');
    expect(html).toContain('data-kind="tag"');
    // Structured path — no raw markdown HTML soup.
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });
});
