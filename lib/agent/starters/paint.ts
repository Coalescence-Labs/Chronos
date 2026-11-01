import type { ClientStarterCacheEntry } from "./client-cache";
import type { AgentStarter } from "./schema";

export type StartersPhase = "loading" | "ready" | "fallback";

export type StartersPaint = {
  phase: StartersPhase;
  starters: AgentStarter[];
  /** Clear browser local cache when true (gate deny / empty payload). */
  clearLocalCache: boolean;
  /** Persist API chips to localStorage when true. */
  writeLocalCache: boolean;
};

/** First paint before network: local snapshot match → chips; else skeletons. */
export function paintFromLocalCache(
  local: ClientStarterCacheEntry | null,
): StartersPaint {
  if (local && local.starters.length > 0) {
    return {
      phase: "ready",
      starters: local.starters,
      clearLocalCache: false,
      writeLocalCache: false,
    };
  }
  return {
    phase: "loading",
    starters: [],
    clearLocalCache: false,
    writeLocalCache: false,
  };
}

/**
 * After `/api/agent/starters`: prefer cache/generated; static only on fallback.
 * Never treat fallback as something to seed into localStorage.
 */
export function paintFromStartersApi(input: {
  source: "cache" | "generated" | "fallback" | string | undefined;
  starters: AgentStarter[] | null;
  fallback: AgentStarter[];
}): StartersPaint {
  const starters = input.starters;
  if (!starters || starters.length === 0) {
    return {
      phase: "fallback",
      starters: input.fallback,
      clearLocalCache: true,
      writeLocalCache: false,
    };
  }
  if (input.source === "generated" || input.source === "cache") {
    return {
      phase: "ready",
      starters,
      clearLocalCache: false,
      writeLocalCache: true,
    };
  }
  return {
    phase: "fallback",
    starters,
    clearLocalCache: true,
    writeLocalCache: false,
  };
}

/** Network error: keep painted chips; else static fallbacks (not infinite skeletons). */
export function paintFromStartersFetchFailure(input: {
  currentPhase: StartersPhase;
  currentStarters: AgentStarter[];
  fallback: AgentStarter[];
}): StartersPaint {
  if (input.currentPhase === "ready" && input.currentStarters.length > 0) {
    return {
      phase: "ready",
      starters: input.currentStarters,
      clearLocalCache: false,
      writeLocalCache: false,
    };
  }
  return {
    phase: "fallback",
    starters: input.fallback,
    clearLocalCache: false,
    writeLocalCache: false,
  };
}
