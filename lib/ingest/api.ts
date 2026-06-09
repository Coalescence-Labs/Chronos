import type { RepoHistory } from "@/lib/graph/types";
import type { IngestErrorCode } from "./errors";

/**
 * Wire contract between the BFF routes (app/api/repo/*) and the client
 * adapter (lib/ingest/client.ts). Both sides import from here so the shape
 * can't drift.
 */

export interface RepoResponse {
  repo: { owner: string; repo: string; defaultBranch: string };
  history: RepoHistory;
  /** Next commit page of the default branch, or null when complete. */
  nextPage: number | null;
}

export interface CommitsPageResponse {
  commits: RepoHistory["commits"];
  nextPage: number | null;
}

export interface IngestErrorBody {
  error: {
    code: IngestErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
}
