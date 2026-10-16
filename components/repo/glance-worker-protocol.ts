import type { GlanceResult, RepoHistory } from "@/lib/graph";

export interface GlanceRequest {
  generation: number;
  history: RepoHistory;
  defaultBranch?: string;
}

export type GlanceResponse =
  | { generation: number; result: GlanceResult }
  | { generation: number; failed: true };
