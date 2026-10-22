export { isAgentFeatureConfigured, isAgentKillSwitchActive, AGENT_METADATA_OPT_IN_KEY } from "./config";
export { evaluateAgentGate, agentGateMessage, type AgentGateReason, type AgentGateResult } from "./gate";
export { readAgentOptIn, writeAgentOptIn } from "./metadata";
export { renderSafeAgentMarkdown } from "./safe-markdown";
export * from "./facts";
