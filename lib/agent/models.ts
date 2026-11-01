export function agentSonnetModelId(): string {
  return process.env.CHRONOS_AGENT_SONNET_MODEL?.trim() || "anthropic/claude-sonnet-5.5";
}

export function agentJevModelId(): string {
  // Vercel AI Gateway slug — dated Anthropic IDs (e.g. claude-3-5-haiku-20241022) 404.
  return process.env.CHRONOS_AGENT_JEV_MODEL?.trim() || "anthropic/claude-haiku-5.5";
}
