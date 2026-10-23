import { generateText, gateway, Output } from "ai";
import type { RepoHistory } from "@/lib/graph";
import { agentGateMessage, evaluateAgentGate } from "@/lib/agent/gate";
import { agentJevModelId } from "@/lib/agent/models";
import {
  agentMonthlyCapUsd,
  isAgentSpendWithinBudget,
  notifyAgentSpendThreshold,
  readAgentSpendUsd,
  recordAgentSpendUsd,
} from "@/lib/agent/spend";
import { guardGeneratePrompt } from "@/lib/agent/spend-limits";
import {
  ESTIMATED_STARTERS_USD,
  isWithinStarterInputBudget,
} from "./budget";
import {
  readStarterCache,
  resolveStarterCacheKey,
  writeStarterCache,
} from "./cache";
import { buildStarterGraphContext } from "./context";
import { staticAgentStarters } from "./fallback";
import { agentStartersResponseSchema, type AgentStarter } from "./schema";

const STARTER_INSTRUCTIONS = [
  "You write empty-chat starter questions for Chronos Agent Graph Q&A.",
  "Use only the provided graph facts (public repo, loaded history).",
  "Return 2–4 starters that help the user explore this branch graph.",
  "Each starter must be answerable from git graph structure (branches, merges, tips, dates).",
  "Do not ask for file contents, secrets, credentials, or private data.",
  "Labels are short chip text; prompts are the full question (may match the label).",
  "Prefer concrete branch names from the facts when helpful.",
].join("\n");

export type StarterSource = "cache" | "generated" | "fallback";

export interface GenerateStartersInput {
  workosUserId: string;
  userEmail?: string | null;
  owner: string;
  repo: string;
  history: RepoHistory;
  defaultBranch?: string;
  now?: Date;
}

export interface GenerateStartersResult {
  ok: boolean;
  starters: AgentStarter[];
  source: StarterSource;
  error?: string;
  snapshotHash?: string;
  /** Wall time for Redis/memory GET on cache-hit path (target ≤ ~25ms). */
  cacheReadMs?: number;
}

export async function generateAgentStarters(
  input: GenerateStartersInput,
): Promise<GenerateStartersResult> {
  const fallback = staticAgentStarters(input.history, input.defaultBranch);

  // Gate + Redis lookup in parallel so a warm cache is not blocked behind Haiku
  // and only pays fingerprint (cheap tip-set) + one GET (target ≤ ~25ms).
  const [gate, cacheLookup] = await Promise.all([
    evaluateAgentGate(input.workosUserId, { requireSpendReady: true }),
    (async () => {
      const { key, snapshotHash } = resolveStarterCacheKey({
        owner: input.owner,
        repo: input.repo,
        workosUserId: input.workosUserId,
        history: input.history,
        defaultBranch: input.defaultBranch,
        now: input.now,
      });
      const started = performance.now();
      const cached = await readStarterCache(key);
      const cacheReadMs = Math.round(performance.now() - started);
      return { key, snapshotHash, cached, cacheReadMs };
    })(),
  ]);

  const { key, snapshotHash, cached, cacheReadMs } = cacheLookup;

  if (!gate.allowed) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: agentGateMessage(gate.reason),
      snapshotHash,
    };
  }

  if (cached) {
    return {
      ok: true,
      starters: cached.starters,
      source: "cache",
      snapshotHash,
      cacheReadMs,
    };
  }

  if (!(await isAgentSpendWithinBudget())) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: "Chronos Agent reached its monthly spend cap.",
      snapshotHash,
    };
  }

  const { contextJson } = buildStarterGraphContext({
    owner: input.owner,
    repo: input.repo,
    history: input.history,
    defaultBranch: input.defaultBranch,
  });

  if (!isWithinStarterInputBudget(STARTER_INSTRUCTIONS, contextJson)) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: "Starter context exceeded the Haiku input budget.",
      snapshotHash,
    };
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: agentGateMessage("not-configured"),
      snapshotHash,
    };
  }

  const guarded = guardGeneratePrompt(
    `${STARTER_INSTRUCTIONS}\n\nGraph facts JSON:\n${contextJson}`,
    "haiku",
  );
  if (!guarded.ok) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: guarded.error,
      snapshotHash,
    };
  }

  const reserved = await recordAgentSpendUsd(ESTIMATED_STARTERS_USD);
  if (!reserved) {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: "Chronos Agent reached its monthly spend cap.",
      snapshotHash,
    };
  }

  try {
    const { output } = await generateText({
      model: gateway(agentJevModelId()),
      output: Output.object({
        schema: agentStartersResponseSchema,
        name: "AgentStarters",
        description: "Empty-chat graph Q&A starter prompts for Chronos Agent.",
      }),
      prompt: guarded.prompt,
      maxOutputTokens: guarded.maxOutputTokens,
    });

    const parsed = agentStartersResponseSchema.safeParse(output);
    if (!parsed.success) {
      return {
        ok: false,
        starters: fallback,
        source: "fallback",
        error: "Starter schema validation failed.",
        snapshotHash,
      };
    }

    await writeStarterCache(key, parsed.data, input.now);
    const spent = await readAgentSpendUsd();
    void notifyAgentSpendThreshold(
      input.workosUserId,
      spent,
      agentMonthlyCapUsd(),
      input.userEmail,
    );

    return {
      ok: true,
      starters: parsed.data.starters,
      source: "generated",
      snapshotHash,
    };
  } catch {
    return {
      ok: false,
      starters: fallback,
      source: "fallback",
      error: "Could not generate starters.",
      snapshotHash,
    };
  }
}
