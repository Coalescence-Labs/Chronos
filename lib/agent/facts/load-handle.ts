import { createHash } from "node:crypto";
import type { RepoHistory } from "@/lib/graph";

/** Stable handle (a) for the currently loaded graph slice — not repo content. */
export function buildLoadHandle(owner: string, repo: string, history: RepoHistory): string {
  const tip = history.commits[0]?.sha ?? "empty";
  const digest = createHash("sha256")
    .update(`${owner}/${repo}\0${history.commits.length}\0${tip}`)
    .digest("hex");
  return digest.slice(0, 16);
}
