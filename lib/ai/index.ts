/**
 * AI integration point — Chronos Agent orchestration lives under lib/agent.
 *
 * Feature surface (#4) and provider (#5) remain open in docs/ARCHITECTURE.md
 * until owner ratifies graph Q&A. Gate + safe markdown ship in M1; live calls
 * require opt-in, Redis spend controls, and Vercel AI Gateway + written ZDR.
 */

export { evaluateAgentGate, isAgentFeatureConfigured, isAgentKillSwitchActive } from "@/lib/agent";
export const AI_FEATURES_ENABLED = false;
