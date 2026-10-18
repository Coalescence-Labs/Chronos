import { createHash } from "node:crypto";
import type { GitHubUserCredentials } from "./user-auth";

type Entry = { expires: number; promise: Promise<GitHubUserCredentials> };
const refreshes = new Map<string, Entry>();

/** A cancelled reader must not cancel a rotation needed by another request. */
export function waitForSharedCredential<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** A short grace window lets concurrent requests save the same rotated credentials. */
export function coordinateGitHubRefresh(
  userId: string,
  refreshToken: string,
  refresh: () => Promise<GitHubUserCredentials>,
): Promise<GitHubUserCredentials> {
  const now = Date.now();
  for (const [key, entry] of refreshes) if (entry.expires <= now) refreshes.delete(key);
  const key = createHash("sha256").update(`${userId}\0${refreshToken}`).digest("hex");
  const existing = refreshes.get(key);
  if (existing) return existing.promise;
  if (refreshes.size >= 256) refreshes.delete(refreshes.keys().next().value!);
  const promise = refresh().catch((error: unknown) => { refreshes.delete(key); throw error; });
  refreshes.set(key, { expires: now + 60_000, promise });
  return promise;
}
