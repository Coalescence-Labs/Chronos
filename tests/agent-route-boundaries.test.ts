import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { parseAgentHistory } from "@/lib/agent/history-input";
import { demoHistory } from "@/lib/demo/history";

let userId = "user_agent_routes";
const withAuth = mock(async () => ({ user: { id: userId, email: "agent@example.test" } }));
mock.module("@workos-inc/authkit-nextjs", () => ({ withAuth }));

const writeAgentOptIn = mock(async (): Promise<void> => {});
mock.module("@/lib/agent/metadata", () => ({ readAgentOptIn: async () => true, writeAgentOptIn }));

const chat = await import("@/app/api/agent/chat/route");
const starters = await import("@/app/api/agent/starters/route");
const optIn = await import("@/app/api/agent/opt-in/route");

const ORIGIN = "https://chronos.test";
const ENV = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test_key",
  WORKOS_COOKIE_PASSWORD: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${ORIGIN}/callback`,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};
const saved = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function post(path: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }): Request {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

beforeAll(() => setEnv(ENV));
afterAll(() => setEnv(saved));
beforeEach(() => {
  withAuth.mockClear();
  writeAgentOptIn.mockReset();
  writeAgentOptIn.mockResolvedValue(undefined);
});

const ROUTES = [
  ["chat", "/api/agent/chat", chat.POST],
  ["starters", "/api/agent/starters", starters.POST],
] as const;

describe.each(ROUTES)("agent %s route", (_name, path, POST) => {
  test("rejects cross-site and originless POSTs before reading the session", async () => {
    const crossSite: Record<string, string> = { origin: "https://evil.test", "content-type": "text/plain" };
    for (const headers of [crossSite, {}]) {
      const response = await POST(post(path, {}, headers));
      expect(response.status).toBe(403);
    }
    expect(withAuth).not.toHaveBeenCalled();
  });

  test("answers malformed history with 400, not an unhandled 500", async () => {
    const response = await POST(post(path, {
      question: "What changed?",
      owner: "chronos",
      repo: "demo",
      history: { commits: [], refs: [null] },
    }));
    expect(response.status).toBe(400);
  });
});

describe("parseAgentHistory", () => {
  test("accepts the graph the app sends", () => {
    const history = demoHistory();
    expect(parseAgentHistory(JSON.parse(JSON.stringify(history)))).toEqual(history);
  });

  test("rejects malformed shapes", () => {
    const commit = { sha: "a", parents: [], author: "ada", date: "", message: "" };
    const ref = { name: "main", type: "branch", sha: "a" };
    for (const raw of [
      null,
      "history",
      { commits: [] },
      { commits: [null], refs: [] },
      { commits: [{ sha: "a" }], refs: [] },
      { commits: [{ ...commit, parents: [1] }], refs: [] },
      { commits: [], refs: [null] },
      { commits: [], refs: [{ ...ref, type: "remote" }] },
      { commits: Array.from({ length: 2_501 }, () => commit), refs: [] },
    ]) {
      expect(parseAgentHistory(raw)).toBeNull();
    }
  });

  test("drops fields the graph model does not define", () => {
    const commit = { sha: "a", parents: [], author: "ada", date: "", message: "" };
    const parsed = parseAgentHistory({ commits: [{ ...commit, patch: "secret" }], refs: [] });
    expect(parsed?.commits[0]).toEqual(commit);
  });
});

describe("agent opt-in route", () => {
  test("keeps upstream error text out of the response", async () => {
    writeAgentOptIn.mockRejectedValue(new TypeError("WorkOS rejected key sk_test_leak"));

    const response = await optIn.POST(post("/api/agent/opt-in", { enabled: true }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Could not save preference" });
  });

  test("is rate limited, with a message the account card can show", async () => {
    userId = "user_opt_in_burst";
    for (let i = 0; i < 30; i++) {
      expect((await optIn.POST(post("/api/agent/opt-in", { enabled: true }))).status).toBe(200);
    }

    const limited = await optIn.POST(post("/api/agent/opt-in", { enabled: true }));

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(typeof (await limited.json()).error).toBe("string");
    expect(writeAgentOptIn).toHaveBeenCalledTimes(30);
    userId = "user_agent_routes";
  });
});
