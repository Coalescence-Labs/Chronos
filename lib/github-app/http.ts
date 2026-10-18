import { IngestError } from "@/lib/ingest/errors";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
let activeRequests = 0;

/** Bounds upstream concurrency, duration and raw response memory; never retries mutations. */
export async function githubFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.origin !== "https://api.github.com" &&
    !(url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token")) {
    throw new IngestError("upstream", "Invalid GitHub endpoint.");
  }
  if (activeRequests >= 32) throw new IngestError("rate-limited", "Chronos is busy. Please try again shortly.", 1);
  activeRequests++;
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
  try {
    let target = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(target, { ...init, signal, cache: "no-store", redirect: "manual" });
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if ((init.method && init.method !== "GET") || !location) break;
        const next = new URL(location, target);
        if (next.origin !== "https://api.github.com") break;
        target = next;
        continue;
      }
      if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
        await response.body?.cancel();
        throw new IngestError("too-large", "GitHub's response is too large to load safely.");
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
              await reader.cancel();
              throw new IngestError("too-large", "GitHub's response is too large to load safely.");
            }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    }
    throw new IngestError("upstream", "GitHub redirected to an unsupported endpoint.");
  } catch (error) {
    if (error instanceof IngestError) throw error;
    if (init.signal?.aborted) throw error;
    throw new IngestError("upstream", deadline.aborted
      ? "GitHub took too long to respond. Please try again."
      : "Could not reach GitHub. Please try again shortly.");
  } finally { activeRequests--; }
}

export async function githubResponseError(response: Response): Promise<IngestError> {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retry = response.headers.get("retry-after");
  const body = await response.json().catch(() => ({})) as { message?: string };
  const secondary = /secondary rate limit|abuse detection/i.test(body.message ?? "");
  if (response.status === 429 || (response.status === 403 && (remaining === "0" || retry || secondary))) {
    const reset = response.headers.get("x-ratelimit-reset");
    const seconds = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry)
      : retry && Number.isFinite(Date.parse(retry)) ? (Date.parse(retry) - Date.now()) / 1000
      : remaining === "0" && reset && Number.isFinite(Number(reset)) ? Number(reset) - Date.now() / 1000 : 60;
    return new IngestError("rate-limited", "GitHub's rate limit was reached. Please wait before trying again.", Math.max(1, Math.ceil(seconds)));
  }
  if (response.status === 401) return new IngestError("reconnect-required", "GitHub authorization expired or was revoked. Reconnect GitHub in your account.");
  if (response.status === 403) return new IngestError("access-denied", response.headers.has("x-github-sso")
    ? "Your organization requires GitHub SSO authorization. Authorize Chronos through your organization's GitHub settings, then reconnect."
    : "GitHub denied access. Check organization approval and selected repositories in your GitHub App settings.");
  if (response.status === 404 || response.status === 451) return new IngestError("not-found", "Repository not found. It may be private or misspelled. Check GitHub App access in your account: organization repos need an organization-approved installation with this repo selected.");
  return new IngestError("upstream", `GitHub returned an unexpected response (${response.status}).`);
}
