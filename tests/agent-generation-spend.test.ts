import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as ai from "ai";
import * as ledger from "@/lib/agent/spend/ledger";
import { linear } from "./fixtures/history";

const prices = [
  { id: "anthropic/claude-haiku-5.5", max_tokens: 128_000, pricing: {
    input: "0.0000001", output: "0.0000005",
    input_tiers: [{ cost: "0.0000005", min: 100_001 }],
    output_tiers: [{ cost: "0.0000025", min: 100_001 }],
    input_cache_write: "0.000000625",
  } },
  { id: "anthropic/claude-sonnet-5.5", max_tokens: 128_000, pricing: {
    input: "0.000003", output: "0.000015",
  } },
];
const starters = { starters: [
  { id: "main", label: "What merged?", prompt: "What merged into main?" },
  { id: "branches", label: "Which branches?", prompt: "Which branches are active?" },
] };
const events: string[] = [];
const settled: number[] = [];
let spent = 0;
let classifierAllows = true;
let classifierCost = 0.001;
let failure: "transport" | "schema" | null = null;
let includeReceipt = true;
const originalFetch = globalThis.fetch;
const originalKey = process.env.AI_GATEWAY_API_KEY;
const holds = new Map<string, number>();

mock.module("@/lib/agent/gate", () => ({
  evaluateAgentGate: async () => ({ allowed: true }),
  agentGateMessage: (reason: string) => reason,
}));
mock.module("@/lib/agent/spend/ledger", () => ({
  ...ledger,
  reserveAgentSpendUsd: async (user: string, usd: number) => {
    events.push(`reserve:${user}`);
    if (spent + usd > 5) return null;
    spent += usd;
    const reservationKey = crypto.randomUUID();
    holds.set(reservationKey, usd);
    return { ledgerKey: user, reservationKey, reservedUsd: usd };
  },
  settleAgentSpendUsd: async (reservation: ledger.AgentSpendReservation, usd: number) => {
    spent += usd - holds.get(reservation.reservationKey)!;
    holds.delete(reservation.reservationKey);
    settled.push(usd);
    events.push("settle");
  },
}));
mock.module("ai", () => ({
  ...ai,
  gateway: (model: string) => model,
  generateText: async (options: {
    prompt: string;
    maxOutputTokens: number;
    maxRetries: number;
    output?: unknown;
    onLanguageModelCallEnd: (receipt: { providerMetadata?: { gateway: { cost: string } }; usage: { inputTokens: number; outputTokens: number } }) => void;
  }) => {
    expect(options.maxRetries).toBe(0);
    expect(options.maxOutputTokens).toBeLessThanOrEqual(128_000);
    events.push("generate");
    if (failure === "transport") throw new Error("connection lost");
    const classifier = options.prompt.includes("You are Jev");
    options.onLanguageModelCallEnd({
      ...(includeReceipt ? { providerMetadata: { gateway: { cost: String(classifier ? classifierCost : 0.24999) } } } : {}),
      usage: { inputTokens: 1_000, outputTokens: classifier ? 10 : 16_666 },
    });
    if (failure === "schema") throw new Error("invalid structured output");
    return {
      text: classifier ? JSON.stringify({ allow: classifierAllows, flags: [] }) : "Main contains the initial commit.",
      output: options.output ? starters : undefined,
    };
  },
}));

const { runAgentTurn } = await import("@/lib/agent/orchestrate");
const { generateAgentStarters } = await import("@/lib/agent/starters/generate");
const { clearStarterMemoryCache } = await import("@/lib/agent/starters/cache");
const { agentGenerationCost, agentGenerationReservation, parseAgentModelPricing } = await import("@/lib/agent/spend/generation");

const input = {
  workosUserId: "user_billing", owner: "acme", repo: "widgets",
  question: "What is on main?", history: linear(3), repoIsPublic: true,
};

beforeEach(() => {
  spent = 0;
  events.length = settled.length = 0;
  holds.clear();
  clearStarterMemoryCache();
  classifierAllows = true;
  classifierCost = 0.001;
  failure = null;
  includeReceipt = true;
  process.env.AI_GATEWAY_API_KEY = "synthetic-test-key";
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toBe("https://ai-gateway.vercel.sh/v1/models");
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeUndefined();
    return Response.json({ data: prices });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = originalKey;
});

describe("Agent generation billing", () => {
  test("charges both Jev and an expensive answer from actual receipts", async () => {
    expect((await runAgentTurn(input)).ok).toBe(true);
    expect(settled).toEqual([0.001, 0.24999]);
    expect(spent).toBeCloseTo(0.25099, 8);
    expect(events).toEqual(["reserve:user_billing", "generate", "settle", "reserve:user_billing", "generate", "settle"]);
    expect(holds.size).toBe(0);
  });

  test("a refused question still pays for Jev but never reserves an answer", async () => {
    classifierAllows = false;
    expect((await runAgentTurn(input)).ok).toBe(false);
    expect(settled).toEqual([0.001]);
    expect(events).toEqual(["reserve:user_billing", "generate", "settle"]);
  });

  test("private and unverified repositories cannot incur model spend", async () => {
    expect((await runAgentTurn({ ...input, repoIsPublic: false })).ok).toBe(false);
    expect((await generateAgentStarters({ ...input, repoIsPublic: false })).ok).toBe(false);
    expect(events).toEqual([]);
  });

  test("cannot start a model call without room for its reservation", async () => {
    spent = 4.99;
    expect((await runAgentTurn(input)).error).toContain("monthly spend cap");
    expect(events).toEqual(["reserve:user_billing"]);
    expect(spent).toBe(4.99);
  });

  test("rechecks available capacity before the answer after charging Jev", async () => {
    spent = 4.65;
    classifierCost = 0.12;
    expect((await runAgentTurn(input)).error).toContain("monthly spend cap");
    expect(settled).toEqual([0.12]);
    expect(events.filter((event) => event === "generate")).toHaveLength(1);
  });

  test("unknown transport failures keep their hold", async () => {
    failure = "transport";
    expect((await runAgentTurn(input)).ok).toBe(false);
    expect(spent).toBeGreaterThan(0.02);
    expect(settled).toEqual([]);
    expect(holds.size).toBe(1);
  });

  test("starter generation settles once and cache hits are free", async () => {
    expect((await generateAgentStarters(input)).source).toBe("generated");
    expect((await generateAgentStarters(input)).source).toBe("cache");
    expect(settled).toEqual([0.24999]);
    expect(events.filter((event) => event === "generate")).toHaveLength(1);
  });

  test("invalid structured output still settles the completed call", async () => {
    failure = "schema";
    expect((await generateAgentStarters(input)).ok).toBe(false);
    expect(settled).toEqual([0.24999]);
    expect(holds.size).toBe(0);
  });

  test("missing Gateway cost uses actual tokens at conservative rates", async () => {
    includeReceipt = false;
    expect((await runAgentTurn(input)).ok).toBe(true);
    expect(settled[1]).toBeCloseTo(0.25299, 8);
  });
});

describe("Agent cost bounds", () => {
  test("includes higher tiers, regions and cache-write prices", () => {
    const pricing = parseAgentModelPricing({ max_tokens: 128_000, pricing: {
      ...prices[0]!.pricing,
      regional: { eu: { input: "0.00000055", output: "0.00000275", input_cache_write: "0.0000006875" } },
    } });
    expect(pricing.inputUsdPerToken).toBe(0.0000006875);
    expect(pricing.outputUsdPerToken).toBe(0.00000275);
    const limits = agentGenerationReservation({ prompt: "é".repeat(1_000), schemaText: "s".repeat(500), maxOutputTokens: 500_000 }, pricing);
    expect(limits.maxOutputTokens).toBe(128_000);
    expect(limits.reservedUsd).toBeGreaterThanOrEqual((2_000 + 500) * pricing.inputUsdPerToken + 128_000 * pricing.outputUsdPerToken);
  });

  test("rejects unknown/invalid prices instead of charging a fixed estimate", () => {
    for (const model of [undefined, { max_tokens: 100, pricing: { input: null, output: "1" } }, { max_tokens: 100, pricing: { input: "1", output: "1", varies_by_provider: true } }]) {
      expect(() => parseAgentModelPricing(model)).toThrow();
    }
  });

  test("zero is a valid receipt; missing usage is never interpreted as free", () => {
    const pricing = parseAgentModelPricing(prices[1]);
    expect(agentGenerationCost({ providerMetadata: { gateway: { cost: "0" } } }, pricing)).toBe(0);
    expect(agentGenerationCost({ providerMetadata: { gateway: { cost: null } }, usage: { inputTokens: 100 } }, pricing)).toBeNull();
  });
});
