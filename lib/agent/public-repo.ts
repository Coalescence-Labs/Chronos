import { DEMO_OWNER, DEMO_REPO } from "@/lib/demo/history";
import {
  fetchRepoMeta,
  type GitHubRequestAuth,
  type RepoMeta,
} from "@/lib/ingest/github/fetch";

export const AGENT_PUBLIC_ONLY_ERROR =
  "Chronos Agent beta is limited to public repositories.";

export const AGENT_PUBLIC_VERIFY_ERROR =
  "Chronos Agent could not verify that this repository is public.";

/** Calm UI copy when Agent is unavailable for a private repo (header/tab/panel). */
export const AGENT_PRIVATE_UI_HINT = "Public repos only for now.";

export const AGENT_PRIVATE_CONTROL_LABEL =
  "Chronos Agent unavailable for private repositories";

/** Synthetic /demo history is not a GitHub private repo — treat as public for Agent. */
export function isSyntheticDemoRepo(owner: string, repo: string): boolean {
  return (
    owner.toLowerCase() === DEMO_OWNER.toLowerCase() &&
    repo.toLowerCase() === DEMO_REPO.toLowerCase()
  );
}

/**
 * Fail-closed public-repo check for Agent beta (docs/AI.md, PRIVACY.md).
 * Prefers BFF/GitHub `repoMeta` already on the auth object; otherwise fetches metadata.
 * Never treats missing/unknown visibility as public.
 */
export async function assertPublicRepoForAgent(input: {
  owner: string;
  repo: string;
  auth?: GitHubRequestAuth | null;
}): Promise<{ ok: true; meta: RepoMeta } | { ok: false; error: string }> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  if (!owner || !repo) {
    return { ok: false, error: AGENT_PUBLIC_VERIFY_ERROR };
  }
  if (isSyntheticDemoRepo(owner, repo)) {
    return { ok: true, meta: { defaultBranch: "main", private: false } };
  }

  try {
    const auth = input.auth ?? undefined;
    const meta = auth?.repoMeta ?? (await fetchRepoMeta({ owner, repo }, auth));
    // Fail closed: only an explicit public flag allows Gateway egress.
    if (meta.private !== false) {
      return { ok: false, error: AGENT_PUBLIC_ONLY_ERROR };
    }
    return { ok: true, meta };
  } catch {
    return { ok: false, error: AGENT_PUBLIC_VERIFY_ERROR };
  }
}
