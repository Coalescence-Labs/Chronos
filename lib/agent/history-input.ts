import { z } from "zod";
import type { RepoHistory } from "@/lib/graph";

const MAX_COMMITS = 2_500;

const repoHistorySchema: z.ZodType<RepoHistory> = z.object({
  commits: z.array(z.object({
    sha: z.string(),
    parents: z.array(z.string()),
    author: z.string(),
    date: z.string(),
    message: z.string(),
  })).max(MAX_COMMITS),
  refs: z.array(z.object({
    name: z.string(),
    type: z.enum(["branch", "tag", "head"]),
    sha: z.string(),
  })),
});

/** Browser-sent graph for Agent routes: null unless well-formed; unknown fields are dropped. */
export function parseAgentHistory(raw: unknown): RepoHistory | null {
  const parsed = repoHistorySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
