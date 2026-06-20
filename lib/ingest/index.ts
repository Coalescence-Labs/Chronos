/**
 * Ingestion adapters: source-specific fetchers that produce the normalized
 * RepoHistory model (lib/graph/types). v1 sources go through the server-side
 * BFF proxy (docs/PRIVACY.md, decisions #3 + #7): repo metadata flows
 * GitHub -> our server -> browser transiently, with zero server-side
 * persistence and no content/token logging. Phase 2 adds a local-.git
 * adapter behind the same interface.
 */

import { fetchPublicRepoHistory } from "./client";
import type { IngestOptions, IngestResult } from "./client";

export type { CommitsPageResponse, IngestErrorBody, RepoResponse } from "./api";
export {
  DEFAULT_INITIAL_PAGES,
  DEFAULT_MAX_BRANCH_TIPS,
  DEFAULT_MAX_PAGES,
  fetchPublicRepoHistory,
  refreshRepoHistory,
} from "./client";
export type { IngestOptions, IngestResult, RefreshOptions, RefreshResult } from "./client";
export { INGEST_ERROR_STATUS, IngestError } from "./errors";
export type { IngestErrorCode } from "./errors";
export { parseRepoInput } from "./github/parse";
export type { RepoId } from "./github/parse";

export interface IngestAdapter {
  fetchHistory(input: string, options?: IngestOptions): Promise<IngestResult>;
}

/** v1 entry point: paste a public GitHub URL (decision #3). */
export const githubPublicUrlAdapter: IngestAdapter = {
  fetchHistory: fetchPublicRepoHistory,
};

/**
 * Consent/transparency copy (docs/PRIVACY.md): render wherever a repo URL
 * is submitted, so proxying is disclosed before any data flows.
 */
export const PROXY_DISCLOSURE =
  "Public repo data is fetched through the Chronos server, used only to draw your graph, and never stored or logged.";
