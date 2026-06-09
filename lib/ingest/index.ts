/**
 * Ingestion adapters: source-specific fetchers that produce the normalized
 * RepoHistory model (lib/graph/types). v1 sources go through the server-side
 * BFF proxy (docs/PRIVACY.md, decisions #3 + #7): repo metadata flows
 * GitHub -> our server -> browser transiently, with zero server-side
 * persistence and no content/token logging. Phase 2 adds a local-.git
 * adapter behind the same interface.
 */

import type { RepoHistory } from "@/lib/graph/types";

export type IngestSourceKind = "github-public-url" | "github-oauth";

export interface IngestRequest {
  kind: IngestSourceKind;
  /** "owner/repo" — parsed and validated before any network call. */
  repo: string;
}

export interface IngestAdapter {
  fetchHistory(request: IngestRequest): Promise<RepoHistory>;
}

/** Adapters land with COA-70 (normalized git model + public-URL ingestion). */
