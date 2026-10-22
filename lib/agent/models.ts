export function agentSonnetModelId(): string {
  return process.env.CHRONOS_AGENT_SONNET_MODEL?.trim() || "anthropic/claude-sonnet-4.5";
}

export function agentJevModelId(): string {
  return process.env.CHRONOS_AGENT_JEV_MODEL?.trim() || "anthropic/claude-3-5-haiku-20241022";
}
