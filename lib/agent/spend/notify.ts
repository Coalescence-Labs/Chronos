import { claimIdempotencyKey } from "@/lib/redis/idempotency";

export async function notifyAgentSpendThreshold(
  workosUserId: string,
  spentUsd: number,
  capUsd: number,
  email: string | null | undefined,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CHRONOS_AGENT_SPEND_FROM?.trim();
  if (!apiKey || !from || !email) return;
  if (spentUsd < capUsd * 0.8) return;

  const idemKey = `spend-alert:${workosUserId}:${Math.floor(spentUsd * 100)}`;
  if (!(await claimIdempotencyKey(idemKey))) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Chronos Agent spend notice",
      text: `Chronos Agent has used $${spentUsd.toFixed(2)} of the $${capUsd.toFixed(2)} monthly cap.`,
    }),
  });
}
