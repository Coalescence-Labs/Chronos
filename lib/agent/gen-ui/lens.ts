import type { RepoHistory } from "@/lib/graph";
import type { AgentGenUiPart, AgentLensTargets } from "./types";

const MAX_LENS_SHAS = 12;
const MAX_LENS_BRANCHES = 8;

/**
 * Toggle commit highlight for Agent gen-UI primitives.
 * Same SHA (full or unambiguous prefix) clears; otherwise selects `next`.
 */
export function toggleAgentShaHighlight(current: string | null, next: string): string | null {
  const needle = next.trim().toLowerCase();
  if (!needle) return current;
  if (!current) return next;
  const cur = current.toLowerCase();
  if (cur === needle || cur.startsWith(needle) || needle.startsWith(cur)) return null;
  return next;
}

/** Toggle branch-tip highlight; same tip clears. */
export function toggleAgentTipHighlight(current: string | null, tipSha: string): string | null {
  const needle = tipSha.trim().toLowerCase();
  if (!needle) return current;
  if (!current) return tipSha;
  return current.toLowerCase() === needle ? null : tipSha;
}

function resolveShaPrefix(history: RepoHistory | null | undefined, raw: string): string | null {
  const needle = raw.toLowerCase();
  if (!history) return /^[0-9a-f]{7,64}$/i.test(needle) ? needle : null;
  for (const commit of history.commits) {
    const full = commit.sha.toLowerCase();
    if (full === needle || full.startsWith(needle)) return full;
  }
  return /^[0-9a-f]{7,64}$/i.test(needle) ? needle : null;
}

/**
 * Collect soft GraphView lens targets from a typed answer.
 * Commits and branch tip SHAs become row highlights; branch names are listed
 * for optional trace sync.
 */
export function extractAgentLensTargets(
  parts: readonly AgentGenUiPart[],
  history?: RepoHistory | null,
): AgentLensTargets {
  const shaSet = new Set<string>();
  const branchSet = new Set<string>();

  const addSha = (raw?: string) => {
    if (!raw || shaSet.size >= MAX_LENS_SHAS) return;
    const resolved = resolveShaPrefix(history, raw);
    if (resolved) shaSet.add(resolved);
  };

  const walkInline = (part: AgentGenUiPart) => {
    switch (part.type) {
      case "commit":
        addSha(part.sha);
        break;
      case "branch":
        if (branchSet.size < MAX_LENS_BRANCHES) branchSet.add(part.name);
        addSha(part.tipSha);
        break;
      case "tag":
        addSha(part.sha);
        break;
      case "parents":
        for (const sha of part.shas) addSha(sha);
        break;
      case "list":
        for (const item of part.items) {
          for (const cell of item) walkInline(cell);
        }
        break;
      default:
        break;
    }
  };

  for (const part of parts) walkInline(part);

  // Ground branch names that appear in the answer against loaded refs → tip SHAs.
  if (history) {
    for (const name of branchSet) {
      const ref = history.refs.find(
        (r) => r.type === "branch" && r.name.toLowerCase() === name.toLowerCase(),
      );
      if (ref) addSha(ref.sha);
    }
  }

  return {
    shas: [...shaSet].slice(0, MAX_LENS_SHAS),
    branches: [...branchSet].slice(0, MAX_LENS_BRANCHES),
  };
}
