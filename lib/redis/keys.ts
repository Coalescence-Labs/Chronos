/** Prefix every Chronos Redis key (`chronos:`). Shared Redis OK if nothing escapes this prefix. */

export const CHRONOS_REDIS_PREFIX = "chronos:";

export function chronosKey(...parts: string[]): string {
  return CHRONOS_REDIS_PREFIX + parts.join(":");
}
