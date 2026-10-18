import { createHash } from "node:crypto";
import type { GitHubUserCredentials } from "./user-auth";

type Entry = { expires: number; promise: Promise<GitHubUserCredentials> };
const refreshes = new Map<string, Entry>();

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
