/** Prefix every Chronos Redis key so this database stays Chronos-only. */

export const CHRONOS_REDIS_PREFIX = "chronos:";

export function chronosKey(...parts: string[]): string {
  return CHRONOS_REDIS_PREFIX + parts.join(":");
}
