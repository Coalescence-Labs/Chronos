import { IngestError } from "../errors";

/**
 * Parses user-pasted repo input into a validated { owner, repo } pair.
 * Validation happens here, before any network call — the BFF routes never
 * interpolate unvalidated input into GitHub API URLs.
 */

export interface RepoId {
  owner: string;
  repo: string;
}

/** GitHub login: 1–39 alphanumerics/hyphens, no leading/trailing hyphen. */
const OWNER_PATTERN = /^[a-zA-Z\d](?:[a-zA-Z\d-]{0,37}[a-zA-Z\d])?$/;
/** GitHub repo name: word chars, dots, hyphens. */
const REPO_PATTERN = /^[\w.-]{1,100}$/;

const GITHUB_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;
const GITHUB_SSH_PREFIX = /^git@github\.com:/i;

function invalid(): IngestError {
  return new IngestError(
    "invalid-input",
    "That doesn't look like a GitHub repository. Paste a URL like github.com/owner/repo.",
  );
}

export function parseRepoInput(input: string): RepoId {
  const trimmed = input.trim();
  if (!trimmed) throw invalid();

  let path: string;
  let fromUrl = true;
  if (GITHUB_SSH_PREFIX.test(trimmed)) {
    path = trimmed.replace(GITHUB_SSH_PREFIX, "");
  } else if (GITHUB_URL_PREFIX.test(trimmed)) {
    path = trimmed.replace(GITHUB_URL_PREFIX, "");
  } else if (!trimmed.includes(":") && !trimmed.includes("@")) {
    // Bare "owner/repo" shorthand.
    path = trimmed;
    fromUrl = false;
  } else {
    throw invalid();
  }

  const segments = path.replace(/[?#].*$/, "").split("/").filter(Boolean);
  // A full URL may carry extra segments (/tree/main, /pull/1); shorthand may not.
  if (segments.length < 2 || (!fromUrl && segments.length !== 2)) throw invalid();

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/i, "");
  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) throw invalid();
  if (repo === "." || repo === "..") throw invalid();

  return { owner, repo };
}
