/**
 * AI integration point — Chronos Agent orchestration lives under lib/agent.
 *
 * Canonical decided vs open map: docs/AI.md
 * Beta: Graph Q&A (public repos) via Gateway + Sonnet/Haiku; spend Redis; gates.
 * Still open: written ZDR (#5), Agent UX directions, feature surface beyond beta.
 */

export { evaluateAgentGate, isAgentFeatureConfigured, isAgentKillSwitchActive } from "@/lib/agent";
/** Live Agent turns still require opt-in, Redis spend, gateway env, and budget. */
export const AI_FEATURES_ENABLED = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
