import { isRedisConfigured } from "@/lib/redis/config";
import { isAgentFeatureConfigured, isAgentKillSwitchActive } from "./config";
import { readAgentOptIn } from "./metadata";

export type AgentGateReason =
  | "ok"
  | "kill-switch"
  | "not-opted-in"
  | "not-signed-in"
  | "spend-not-ready"
  | "not-configured";

export interface AgentGateResult {
  allowed: boolean;
  reason: AgentGateReason;
}

/** Static + account gates for M1. Live model calls also require spend ledger (M6). */
export async function evaluateAgentGate(
  workosUserId: string | null | undefined,
  options?: { requireSpendReady?: boolean },
): Promise<AgentGateResult> {
  if (isAgentKillSwitchActive()) return { allowed: false, reason: "kill-switch" };
  if (!isAgentFeatureConfigured()) return { allowed: false, reason: "not-configured" };
  if (!workosUserId) return { allowed: false, reason: "not-signed-in" };
  if (!(await readAgentOptIn(workosUserId))) return { allowed: false, reason: "not-opted-in" };
  if (options?.requireSpendReady && !isRedisConfigured()) {
    return { allowed: false, reason: "spend-not-ready" };
  }
  return { allowed: true, reason: "ok" };
}

export function agentGateMessage(reason: AgentGateReason): string {
  switch (reason) {
    case "kill-switch":
      return "Chronos Agent is temporarily unavailable.";
    case "not-opted-in":
      return "Turn on Chronos Agent in Account to ask questions about this graph.";
    case "not-signed-in":
      return "Sign in and enable Chronos Agent in Account to continue.";
    case "spend-not-ready":
      return "Chronos Agent is not available until spend controls are configured.";
    case "not-configured":
      return "Chronos Agent is not enabled in this environment.";
    default:
      return "";
  }
}
