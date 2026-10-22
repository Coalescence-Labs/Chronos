import { Redis } from "@upstash/redis";
import { isRedisConfigured, redisRestCredentials } from "./config";

let client: Redis | undefined;

/** Shared Upstash client; null when env is unset (local dev without Redis). */
export function getRedis(): Redis | null {
  if (!isRedisConfigured()) return null;
  if (!client) {
    const creds = redisRestCredentials();
    if (!creds) return null;
    client = new Redis({ url: creds.url, token: creds.token });
  }
  return client;
}
