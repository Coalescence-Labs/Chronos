import { INGEST_ERROR_STATUS, IngestError } from "./errors";
import type { IngestErrorBody } from "./api";

/**
 * Response helpers shared by the BFF routes. Every response is `no-store`:
 * the proxy must not let a CDN or browser cache become a durable copy of
 * repo data before a deliberate caching strategy exists (open decision #6,
 * COA-74). Errors are returned, never logged — a log line carrying repo
 * input would violate docs/PRIVACY.md.
 */

const BASE_HEADERS = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown): Response {
  return Response.json(body, { headers: BASE_HEADERS });
}

export function errorResponse(error: unknown): Response {
  const ingestError =
    error instanceof IngestError
      ? error
      : new IngestError("upstream", "Something went wrong fetching the repository.");

  const body: IngestErrorBody = {
    error: {
      code: ingestError.code,
      message: ingestError.message,
      ...(ingestError.retryAfterSeconds !== undefined && {
        retryAfterSeconds: ingestError.retryAfterSeconds,
      }),
    },
  };
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (ingestError.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(ingestError.retryAfterSeconds);
  }
  return Response.json(body, {
    status: INGEST_ERROR_STATUS[ingestError.code],
    headers,
  });
}
