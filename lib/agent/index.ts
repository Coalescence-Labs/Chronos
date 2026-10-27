export {
  agentMissingEnvVarNames,
  isAgentFeatureConfigured,
  isAgentKillSwitchActive,
  AGENT_METADATA_OPT_IN_KEY,
} from "./config";
export { evaluateAgentGate, agentGateMessage, type AgentGateReason, type AgentGateResult } from "./gate";
export { readAgentOptIn, writeAgentOptIn } from "./metadata";
export { renderSafeAgentMarkdown, sanitizeAgentHtml } from "./safe-markdown";
export {
  agentAnswerFormatInstructions,
  buildAgentTurnPrompt,
  resolveAgentAnswerUi,
  type AgentAnswerSurface,
  type AgentAnswerUiHint,
  type AgentUiDensity,
} from "./answer-format";
export * from "./gen-ui";
export * from "./facts";
export { runAgentTurn, type AgentTurnInput, type AgentTurnResult } from "./orchestrate";
export * from "./spend";
export * from "./spend-limits";
// Starters: import from `@/lib/agent/starters` (server) or `…/schema` + `…/fallback` (client).
