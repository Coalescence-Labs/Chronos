import { z } from "zod";

/** One empty-chat starter chip: short label + full prompt text. */
export const agentStarterSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .describe("Stable slug for this starter within the response (kebab-case)."),
  label: z
    .string()
    .min(1)
    .max(80)
    .describe("Short chip text shown in the empty state (under ~60 characters)."),
  prompt: z
    .string()
    .min(1)
    .max(280)
    .describe(
      "Full question submitted when the chip is clicked; graph-anchored, no secrets.",
    ),
});

export const agentStartersResponseSchema = z.object({
  starters: z
    .array(agentStarterSchema)
    .min(2)
    .max(4)
    .describe("Two to four graph-specific starter questions for the empty Agent chat."),
});

export type AgentStarter = z.infer<typeof agentStarterSchema>;
export type AgentStartersResponse = z.infer<typeof agentStartersResponseSchema>;

export function parseStartersPayload(raw: unknown): AgentStartersResponse | null {
  const parsed = agentStartersResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
