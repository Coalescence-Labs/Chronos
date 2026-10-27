# AI infrastructure — Chronos

> Canonical map of **decided** vs **open** AI infra. When higher-level owner
> decisions land, move them here (and into [ARCHITECTURE.md](ARCHITECTURE.md) /
> [PRIVACY.md](PRIVACY.md)) — do not invent answers to items still marked open.
>
> Code lives primarily under `lib/agent/*` (orchestration, gates, facts, spend).
> `lib/ai/*` is a thin re-export / feature flag surface.

---

## Decided vs open (quick map)

| Area | Status | Where |
|------|--------|--------|
| **Beta feature surface** — Graph Q&A over history already loaded in the browser | **Decided (beta)** | This doc §Beta; PRODUCT |
| Broader AI jobs (branch summaries as separate product, etc.) | **Open** (#4 remainder) | ARCHITECTURE #4 |
| **Agent UX / generative UI** — concept **A** (glass dock + graph lens) ratified for prototype; directions B–E still open | **Partial** — A + gen-UI registry building block | This doc §Gen-UI; §Open |
| **Gateway** — Vercel AI Gateway | **Decided (beta)** | This doc §Stack |
| **Models** — Claude Sonnet 5.5 (answers) + Haiku 5.5 (Jev) | **Decided (beta)** — live Gateway slugs | `lib/agent/models.ts` |
| **Written ZDR** for production / private-repo Agent | **Open** (#5) | ARCHITECTURE #5; PRIVACY |
| **Beta privacy carve-out** — public repos only; no written ZDR until ZDR is on file | **Decided (beta)** | PRIVACY Agent section |
| **Spend** — Upstash Redis ledger; **$5 / user / month**; `chronos:` key prefix (shared Organic Redis OK) | **Decided** | This doc §Spend; SECURITY |
| **Gates** — kill switch, WorkOS sign-in, Account opt-in, Redis spend-ready, Gateway key | **Decided** | `lib/agent/gate.ts` |
| **Jev** classifier (question text only) + **fact tools** + safe markdown | **Decided (beta stack)** | `lib/agent/jev.ts`, `facts/`, `safe-markdown.ts` |
| **Major UI design process** — concept image → owner review → then build | **Working agreement** | This doc §Process |

---

## Beta surface (ratified)

**Chronos Agent — Graph Q&A (beta)**

- User asks natural-language questions about the **branch graph already loaded** in the browser.
- Server orchestration (`runAgentTurn`) gates the turn, runs **Jev** on the question text only, gathers **fact-tool** bundles from in-memory history (optional PR titles/labels when GitHub connect + PR-capable question), then calls the answer model via the Gateway.
- Consent: WorkOS account + Account toggle (`chronosAgentOptIn`) + in-product disclosure. Kill switch: `CHRONOS_AGENT_KILL_SWITCH`.
- Scope: **public repositories only** until written ZDR exists. Private-repo Agent is explicitly deferred (see Account copy and [PRIVACY.md](PRIVACY.md)).

**Empty-chat starters (Haiku):** when the Agent panel is empty, `POST /api/agent/starters`
may generate 2–4 chip prompts from the same fact-tool class of graph context (public
repos, opt-in + spend Redis required). **UX:** skeleton chips while loading (never
static→generated flash); browser `localStorage` may paint last-known labels/prompts
keyed by owner/repo + UTC day + history fingerprint; Redis
`chronos:agent-starters:{snapshotHash}` is authoritative. Static chips only on hard
failure / gate deny. Cache-hit path = fingerprint + Redis GET only (no Haiku); target
**≤ ~25ms** for the GET (`cacheReadMs` on the response). Input capped ≈ **$0.05**
(see `lib/agent/starters/budget.ts`); hard Haiku rails in `lib/agent/spend-limits.ts`.

This is the only AI *product* surface ratified for beta. It does **not** close architecture decision #4 for every future AI job — only the Graph Q&A beta.

---

## Stack (ratified for beta)

| Piece | Choice | Notes |
|-------|--------|--------|
| Transport | **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`) | Server-only; never client-bundled |
| Answer model | `anthropic/claude-sonnet-5.5` | Override: `CHRONOS_AGENT_SONNET_MODEL` |
| Jev (classifier) | `anthropic/claude-haiku-5.5` | Override: `CHRONOS_AGENT_JEV_MODEL`; dated Anthropic IDs 404 on Gateway |
| SDK | Vercel AI SDK (`generateText` + `gateway(...)`) | `lib/agent/orchestrate.ts`, `jev.ts` |
| Fact tools | Pure / in-process over loaded `RepoHistory` | `graph_summary`, `branch_tips`, `merge_commits`, `anchored_commit` |
| Empty-chat starters | Haiku 5.5 (`CHRONOS_AGENT_JEV_MODEL`) over compact graph facts | `lib/agent/starters/*`, `POST /api/agent/starters` |
| Output safety | `renderSafeAgentMarkdown` | Untrusted model HTML path |
| Rate limits | Upstash when configured | `enforceDistributedRateLimit(..., "agent")` |
| Per-call spend rails | Hard token ceilings + `maxOutputTokens` before Gateway | `lib/agent/spend-limits.ts` |

Env knobs are listed in `.env.example`.

---

## Per-call hard rails (ratified)

Pre-call guardrails in `lib/agent/spend-limits.ts` bound a **single** Gateway
generation. They are separate from the monthly Upstash ledger (still recorded as
today): clamp/refuse oversized prompts, then set `maxOutputTokens` on every
`generateText` in Agent code (Jev, answer turn, starters).

| Model | Input ceiling | Output ceiling (`maxOutputTokens`) | Dollar target |
|-------|---------------|--------------------------------------|---------------|
| **Haiku 5.5** | **500_000** tokens (owner hard cap) | **500_000** | ≈ **$0.05** in / **$0.25** out → implies **$0.10 / MTok** in, **$0.50 / MTok** out |
| **Sonnet 5.5** | **16_666** tokens | **16_666** | same **$0.05 / $0.25** at list-class **$3 / $15** per MTok (`floor(0.05/3×1e6)`, `floor(0.25/15×1e6)`) |

Char→token density is **3 chars/token** (fail-closed). Users should never hit the
Haiku 500k rails; they exist to prevent accidental spend spikes. Starters keep a
*tighter* operational Haiku input budget (**50_000** tokens ≈ $0.05 at conservative
**$1 / MTok**) in `lib/agent/starters/budget.ts`, layered under the hard rail.

---

## Spend ledger (ratified)

- **Cap:** **$5 USD per user per month** (owner policy).
- **Store:** Upstash Redis (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- **Keys:** always under the **`chronos:`** prefix (`lib/redis/keys.ts`). A **shared** Redis with other Coalescence projects (e.g. Organic) is acceptable **only** if Chronos never writes outside that prefix and never stores repo content.
- **Values:** spend totals / counts / idempotency markers — **no** prompts, facts, or repo identity.
- Optional Resend alert near 80% of cap (`RESEND_API_KEY`, `CHRONOS_AGENT_SPEND_FROM`).
- Live turns require spend-ready Redis (`evaluateAgentGate` + `requireSpendReady`).
- **Starter cache** (separate keys): `chronos:agent-starters:{snapshotHash}` holds Zod-validated `{ starters: [{ id, label, prompt }] }` only — **no** SHAs, commit messages, or raw facts. Snapshot hash covers owner/repo + WorkOS user id + UTC day (`d-m-y`) + history fingerprint (`sorted branch tip SHAs | commit count | default branch`). TTL = remainder of UTC day. Gate + Redis GET run in parallel; on hit, return immediately (no Haiku / no graph-context build). Target Redis GET **≤ ~25ms** (Upstash REST). Browser also keeps a same-day localStorage copy of chip labels/prompts only (`chronos:agent-starters:v1:{hash}`) for instant paint — no tokens or commit payloads. Haiku starter input capped at **~$0.05** (50k tokens @ $1/MTok conservative; 3 chars/token; fail closed), under the hard Haiku rails in §Per-call hard rails.

Implementation: `lib/agent/spend/*`, `lib/agent/spend-limits.ts`, `lib/agent/starters/*`. Keep the ledger honest as per-user keying matures; the **policy** is per-user.

---

## Privacy posture (beta vs long-term)

| Rule | Beta | After written ZDR |
|------|------|-------------------|
| Opt-in | Required | Required |
| Repos | **Public only** | Private Agent may be considered after pre-flight |
| Written ZDR | **Not yet** — open decision #5; beta is bounded to public data | **Mandatory** for any private / expanded Agent |
| Minimum context | Fact bundles from loaded graph; authors omitted from model facts | Same principle |
| Pre-flight | Mandatory for every new egress | Same |

Long-term product promise remains **ZDR-only** AI ([PRIVACY.md](PRIVACY.md)). Beta is an owner-ratified, time-boxed carve-out: public Graph Q&A without written ZDR **until** ZDR is verified in writing. Do not widen the carve-out (private repos, whole-repo dumps, training-prone providers) without a new privacy pre-flight and owner ratification.

---

## Module map

```
lib/ai/           # thin flag / re-exports — do not grow orchestration here
lib/agent/
  gate.ts         # kill switch, config, sign-in, opt-in, spend-ready
  config.ts       # env gates, chronosAgentOptIn key
  models.ts       # Gateway slugs (Sonnet / Haiku)
  jev.ts          # question-only classifier
  orchestrate.ts  # turn pipeline
  facts/          # extract + tools over loaded history
  spend/          # Redis ledger + optional email
  spend-limits.ts # per-call Haiku/Sonnet token + $ rails (pre-Gateway)
  starters/       # Haiku empty-chat starters: schema, budget, cache, generate
  safe-markdown.ts
  answer-format.ts
  gen-ui/         # typed answer parts, sanitize, compose, lens (see §Gen-UI)
components/agent/ # panel / chrome + gen-ui registry render
app/api/agent/    # chat + starters + opt-in routes
```

---

## Agent gen-UI (intentional building block)

Owner-ratified **prototype A** (glass Agent dock over the real graph) plus a
**generative-UI direction**: answers should compose from a small registry of
Chronos-crafted primitives — not free HTML soup and not a 2025 chat default.

**Registry (Graph Q&A):**

| Part | Role |
|------|------|
| `text` | Short prose run (glue) |
| `commit` | Mono, copyable SHA |
| `branch` | Branch ref (badge language) |
| `tag` | Tag / release ref |
| `release_note` | Short release-note claim |
| `date` | Scannable date |
| `list` | Bullets; each item is an inline part sequence |
| `parents` | Parent SHAs |

**Flow:** orchestrator returns markdown (`text` / `html`) and, when composition
succeeds, a sanitized `parts[]` plus optional `lens` (`shas` / `branches`).
`AgentPanel` prefers `parts` → React registry; falls back to safe markdown HTML.
`GraphView` applies a soft `data-lens` row band for referenced commits (concept A),
synced with selection/trace when the user activates a primitive.

**Answer density:** refs (branch/tag) are primary; tip SHAs next to refs are
stripped in compose and stay out of default answers (prompt + `quietRefAdjacentShas`).
Commit primitives render muted (tooltip / long-press copy). Facts bundles still
include `loadHandle` for API/debug — the Agent Q&A footer does **not** surface it.

**Still open:** broader Agent chrome (directions B–E), claim-chip density, and how
far generative UI goes beyond Graph Q&A. The registry is the stable building block;
do not invent a new app shell around it.


---

## Process (working agreements — Chronos AI / design)

1. **Major design path:** generate a **concept image** → **owner review** → **then build**. Do not implement major Agent UI from prose alone when visual direction is unsettled.
2. **Drive vision → implementation.** Prefer shipping from owner-stated direction. Raise **self-contained** asks only when blocked (missing ratification, privacy, or a hard dependency).
3. **Cognitive load still wins.** Agent must reduce confusion about the graph, not add a chatbot for its own sake ([PRODUCT.md](PRODUCT.md)).

Cross-project versions of these agreements also live in the owner’s personal Cursor agent store (`ai-working-agreements.md`).

---

## Open / draft (do not treat as ratified)

### Architecture leftovers

- **#4 remainder — AI feature surface beyond Graph Q&A beta.** Additional products (standalone branch digests, auto-narration, etc.) stay open until the owner picks them.
- **#5 — AI provider ZDR in writing.** Gateway + Anthropic slugs are the beta wiring; contractual ZDR proof is still required before private-repo Agent or dropping the public-only carve-out.

### Agent UX & generative UI (draft)

- **Reject defaulting to 2025 chat-UI precedent** (generic message list + composer as the product). That stance is a design constraint, not a finished UI.
- **Prototype A ratified** (glass dock + soft graph lens + gen-UI registry) — see §Gen-UI. Directions **B–E** remain open; do not promote them without concept-image review.
- **Generative / commoditized intelligence UI (≈2027 ambition)** — richer graph-native answers — remains an ambition beyond the registry building block. Capture ambition; do not invent a new interaction model or app shell.

When the owner ratifies further UX direction, document it here, update [DESIGN.md](DESIGN.md) if visual language changes, and remove the corresponding open note.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — open decisions #4 / #5
- [PRIVACY.md](PRIVACY.md) — ZDR rules + Agent pre-flight
- [PRODUCT.md](PRODUCT.md) — what AI is allowed to mean
- [AUTH.md](AUTH.md) — Account opt-in sits on WorkOS sessions
- [SECURITY.md](SECURITY.md) — Redis prefix / spend hygiene
- `.claude/skills/privacy-preflight/` — mandatory before new AI egress
