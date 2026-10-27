/** Chronos Agent — env gates and model defaults (orchestration in later PRs). */

export const AGENT_METADATA_OPT_IN_KEY = "chronosAgentOptIn";

export function isAgentKillSwitchActive(): boolean {
  const raw = process.env.CHRONOS_AGENT_KILL_SWITCH?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isAgentFeatureConfigured(): boolean {
  return agentMissingEnvVarNames().length === 0;
}

/** Required Agent env var names that are unset (values never returned). */
export function agentMissingEnvVarNames(): string[] {
  const missing: string[] = [];
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) missing.push("AI_GATEWAY_API_KEY");
  return missing;
}
