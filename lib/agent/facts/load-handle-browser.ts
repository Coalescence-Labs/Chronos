import type { RepoHistory } from "@/lib/graph";

/** Browser-safe load handle — matches `buildLoadHandle` on the server. */
export async function buildLoadHandleBrowser(
  owner: string,
  repo: string,
  history: RepoHistory,
): Promise<string> {
  const tip = history.commits[0]?.sha ?? "empty";
  const payload = `${owner}/${repo}\0${history.commits.length}\0${tip}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
