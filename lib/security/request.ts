import { createHmac, randomBytes } from "node:crypto";
import { IngestError } from "@/lib/ingest/errors";

const salt = randomBytes(32);
const requests = new Map<string, { count: number; reset: number }>();

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin" && site !== "none")) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export function enforceRequestLimit(request: Request, userId?: string | null, operation: "repo" | "connection" = "repo"): void {
  // Vercel replaces this header. Other deployments use a conservative anonymous pool.
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : null;
  const identity = userId ? `user:${userId}` : `anonymous:${address ?? "shared"}`;
  const key = createHmac("sha256", salt).update(`${operation}:${identity}`).digest("hex");
  const now = Date.now();
  for (const [id, entry] of requests) {
    if (entry.reset > now) break;
    requests.delete(id);
  }
  const entry = requests.get(key) ?? { count: 0, reset: now + 60_000 };
  if (!requests.has(key) && requests.size >= 10_000) {
    throw new IngestError("rate-limited", "Chronos is busy. Please try again shortly.", 60);
  }
  if (++entry.count > (operation === "connection" ? 30 : userId ? 120 : 60)) {
    throw new IngestError("rate-limited", "Too many requests. Please wait before trying again.", Math.max(1, Math.ceil((entry.reset - now) / 1000)));
  }
  requests.set(key, entry);
}
