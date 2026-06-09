/**
 * Error taxonomy for ingestion. Codes are part of the BFF API contract:
 * routes serialize them to the client and the client adapter rethrows them.
 * Messages are user-facing — keep them friendly and free of repo content.
 */

export type IngestErrorCode =
  | "invalid-input"
  | "not-found"
  | "rate-limited"
  | "too-large"
  | "upstream";

export class IngestError extends Error {
  readonly code: IngestErrorCode;
  /** Present on rate-limited errors when GitHub reports a reset time. */
  readonly retryAfterSeconds?: number;

  constructor(code: IngestErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "IngestError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const INGEST_ERROR_STATUS: Record<IngestErrorCode, number> = {
  "invalid-input": 400,
  "not-found": 404,
  "rate-limited": 429,
  "too-large": 422,
  upstream: 502,
};
