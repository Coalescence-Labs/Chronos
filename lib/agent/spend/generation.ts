import { reserveAgentSpendUsd, settleAgentSpendUsd } from "./ledger";

const CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";
const CATALOG_TTL_MS = 5 * 60_000;
const PROMPT_OVERHEAD_TOKENS = 1_024;

interface ModelPricing {
  inputUsdPerToken: number;
  outputUsdPerToken: number;
  maxOutputTokens: number;
}

interface SpendReceipt {
  providerMetadata?: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface SpendGenerationInput {
  workosUserId: string;
  modelId: string;
  prompt: string;
  maxOutputTokens: number;
  /** Structured-output schema/instructions also consume input tokens. */
  schemaText?: string;
}

export class AgentSpendCapError extends Error {
  constructor() {
    super("Chronos Agent reached its monthly spend cap.");
  }
}

function amount(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Reserve at the highest published tier/region, including cache writes. */
export function parseAgentModelPricing(model: unknown): ModelPricing {
  const entry = record(model);
  const pricing = record(entry?.pricing);
  const maxOutputTokens = amount(entry?.max_tokens);
  if (!pricing || !maxOutputTokens || !Number.isInteger(maxOutputTokens)) {
    throw new Error("Agent model pricing unavailable");
  }
  const inputs: number[] = [];
  const outputs: number[] = [];
  function collect(prices: Record<string, unknown>) {
    if (prices.varies_by_provider === true) throw new Error("Agent model pricing is provider-dependent");
    for (const field of ["input", "output", "input_cache_read", "input_cache_write"]) {
      const values = field === "output" ? outputs : inputs;
      if (field in prices || field === "input" || field === "output") {
        const rate = amount(prices[field]);
        if (rate === null) throw new Error("Agent model pricing unavailable");
        values.push(rate);
      }
      const tiers = prices[`${field}_tiers`];
      if (tiers !== undefined) {
        if (!Array.isArray(tiers)) throw new Error("Agent model pricing unavailable");
        for (const tier of tiers) {
          const rate = amount(record(tier)?.cost);
          if (rate === null) throw new Error("Agent model pricing unavailable");
          values.push(rate);
        }
      }
    }
    if (prices.regional !== undefined) {
      const regions = record(prices.regional);
      if (!regions) throw new Error("Agent model pricing unavailable");
      for (const value of Object.values(regions)) {
        const region = record(value);
        if (!region) throw new Error("Agent model pricing unavailable");
        collect(region);
      }
    }
  }
  collect(pricing);
  return {
    inputUsdPerToken: Math.max(...inputs),
    outputUsdPerToken: Math.max(...outputs),
    maxOutputTokens,
  };
}

let catalog: { expiresAt: number; models: unknown[] } | undefined;
let pendingCatalog: Promise<unknown[]> | undefined;

async function modelPricing(modelId: string): Promise<ModelPricing> {
  if (!catalog || catalog.expiresAt <= Date.now()) {
    pendingCatalog ??= (async () => {
      // Public metadata only: no authorization, user id, prompt, or repo data.
      const response = await fetch(CATALOG_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error("Agent model pricing unavailable");
      const data = record(await response.json())?.data;
      if (!Array.isArray(data)) throw new Error("Agent model pricing unavailable");
      catalog = { models: data, expiresAt: Date.now() + CATALOG_TTL_MS };
      return data;
    })().finally(() => { pendingCatalog = undefined; });
    await pendingCatalog;
  }
  return parseAgentModelPricing(catalog?.models.find((model) => record(model)?.id === modelId));
}

export function agentGenerationReservation(input: {
  prompt: string;
  schemaText?: string;
  maxOutputTokens: number;
}, pricing: ModelPricing): { reservedUsd: number; maxOutputTokens: number } {
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0) {
    throw new Error("Invalid Agent output limit");
  }
  const maxOutputTokens = Math.min(input.maxOutputTokens, pricing.maxOutputTokens);
  // UTF-8 bytes conservatively bound text tokens; chars/3 is only a UX estimate.
  const inputTokens = new TextEncoder().encode(input.prompt + (input.schemaText ?? "")).length
    + PROMPT_OVERHEAD_TOKENS;
  const bound = inputTokens * pricing.inputUsdPerToken + maxOutputTokens * pricing.outputUsdPerToken;
  return { reservedUsd: Math.max(0.000001, Math.ceil(bound * 1e6) / 1e6), maxOutputTokens };
}

export function agentGenerationCost(receipt: SpendReceipt, pricing: ModelPricing): number | null {
  const actual = amount(record(receipt.providerMetadata?.gateway)?.cost);
  if (actual !== null) return actual;
  const input = amount(receipt.usage?.inputTokens);
  const output = amount(receipt.usage?.outputTokens);
  if (input === null || output === null) return null;
  return input * pricing.inputUsdPerToken + output * pricing.outputUsdPerToken;
}

/** Every billable call owns one hold; unknown failures retain it conservatively. */
export async function withAgentGenerationSpend<T>(
  input: SpendGenerationInput,
  generate: (options: {
    maxOutputTokens: number;
    maxRetries: number;
    onLanguageModelCallEnd: (receipt: SpendReceipt) => void;
  }) => Promise<T>,
): Promise<T> {
  const pricing = await modelPricing(input.modelId);
  const limits = agentGenerationReservation(input, pricing);
  const reservation = await reserveAgentSpendUsd(input.workosUserId, limits.reservedUsd);
  if (!reservation) throw new AgentSpendCapError();
  let actualUsd: number | null = null;
  try {
    return await generate({
      maxOutputTokens: limits.maxOutputTokens,
      maxRetries: 0,
      // Runs before structured-output parsing, so invalid JSON is still billed.
      onLanguageModelCallEnd: (receipt) => { actualUsd = agentGenerationCost(receipt, pricing); },
    });
  } finally {
    if (actualUsd !== null) await settleAgentSpendUsd(reservation, actualUsd);
  }
}
