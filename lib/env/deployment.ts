/**
 * Local development detection for dev-only UI (missing env hints).
 * Never use this to weaken production security — hints are names-only and gated here.
 */

export function isChronosDevelopment(): boolean {
  const env = process.env.ENV?.trim().toLowerCase();
  if (env === "development") return true;
  return process.env.NODE_ENV === "development";
}

/** Missing env var names — only returned in Chronos development. */
export function devOnlyMissingEnvVarNames(names: readonly string[]): string[] | undefined {
  if (!isChronosDevelopment() || names.length === 0) return undefined;
  return [...names];
}

export function stripDevMissingEnvVarNames<T extends { missingEnvVars?: string[] }>(
  payload: T,
): T {
  if (isChronosDevelopment() || payload.missingEnvVars === undefined) return payload;
  const { missingEnvVars: _, ...rest } = payload;
  return rest as T;
}
