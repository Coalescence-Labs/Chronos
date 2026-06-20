# Privacy & Security — Chronos

> Privacy is a **product promise**, not a feature flag. Viewing a repo must never quietly cost the user their data. This document is binding; when it conflicts with convenience, privacy wins.

## Principles

1. **Minimize what touches our servers.** The less repo/user data that transits or rests on our infrastructure, the smaller the promise we have to keep. Prefer architectures that keep data on the user's device.
2. **Opt-in, not opt-out.** Anything beyond rendering the graph — especially AI — is off until the user turns it on, with a clear statement of what it sends where.
3. **Least privilege.** GitHub OAuth requests the **minimum scopes** needed. Store the minimum token data for the minimum time. Never request write scopes — Chronos only reads.
4. **No silent egress.** Every path that sends data off-device or off-server is documented and intentional. New egress paths require the privacy pre-flight (below).
5. **Transparency.** Because Chronos is open source, the privacy claims are auditable. Keep them honest.

## AI: Zero Data Retention (ZDR) only

AI features are **opt-in** and may only use a provider that contractually guarantees **Zero Data Retention** — no storage of prompts/outputs beyond the request, and **no training** on user data.

Hard rules:
- Verify ZDR **in writing** from the provider before any integration. (Open decision: which provider — see [ARCHITECTURE.md](ARCHITECTURE.md) #5.)
- Send the **minimum** necessary context to answer the user's request — never the whole repo "just in case."
- Make it explicit in the UI what is sent off-device when an AI feature is used.
- AI is gated behind the **privacy pre-flight skill** — see below.

## The privacy pre-flight (mandatory)

Before merging **any** AI feature or **any** new path that sends user/repo data off the user's device or off our server, run the guardrail at `.claude/skills/privacy-preflight/`. It is a short checklist that forces you to name the data, the destination, the retention terms, and the user's consent surface. No exceptions — the owner emphasized privacy as a core pillar.

## Ingestion: server-side BFF proxy (decisions #3 + #7, resolved)

> Posture note: an earlier draft resolved #3 as *client-side* (repo data never touches our servers). It was **deliberately revised** when #7 chose the **BFF (Backend-for-Frontend)** OAuth pattern for maximum token security — BFF requires the server to make the GitHub calls, so repo data now transits our infrastructure. This is a conscious trade of "data off our servers" for "token never exposed to browser JS." It is bounded by the rules below; it is **not** a license to retain or mine repo data.

How it works and what this document binds:

- **The OAuth token rests server-side** in an encrypted, httpOnly, SameSite, Secure session — never readable by browser JS, never in the client bundle or logs (Principle 3, 6).
- **The server proxies GitHub API calls.** Public-repo git metadata flows GitHub → our server → browser **transiently**. **Zero server-side persistence of repo content**, and **no logging of repo content or tokens** (Principle 1, applied as "minimize what *rests*").
- **Fetch the minimum:** only graph-relevant commit fields (sha, parents, author, date, message, refs) — not file contents/diffs unless a specific feature needs them and re-clears pre-flight.
- **Caching** may be both server-side (short-TTL, content-addressed, no PII beyond what GitHub already exposes) and client-side; neither may become a durable store of repo data (see #6).
- **Consent/transparency:** the UI discloses that requests are proxied through our server and that we store neither repo data nor the token beyond the session.
- **Private repos are out of scope for v1.** The BFF posture would technically support them, but adding private-repo scope requires a **fresh privacy pre-flight** — private repo data transiting our servers is a materially different promise.

Default bias remains: minimize what *rests* on our servers, and never retain or train on repo data.

## Analytics (Vercel Web Analytics + Speed Insights)

Cookieless, anonymous, first-party product analytics (no third party, no cross-day/cross-site identifier). The full design + event catalog is in [ANALYTICS.md](ANALYTICS.md). The binding rules:

- **No repo identity, ever.** Page-view URLs are scrubbed to their **route template** before anything is sent — `/repo/[owner]/[repo]`, never the filled-in owner/name — by a `beforeSend` hook over a fixed route **allowlist** (`lib/analytics.ts` `scrubUrl`). Unrecognized paths are **dropped** (fail closed). Query strings and hashes are always discarded.
- **No PII, no repo content.** We collect only anonymous aggregates (coarse geo/device from Vercel) plus, in future, a typed allowlist of enums/counts/durations (COA-97/98) — never commit messages, SHAs, branch/tag names, authors, tokens, or free text. Sizes are bucketed.
- **One chokepoint.** All analytics flow through `lib/analytics.ts`; components never call the Vercel SDK directly, so the data surface is auditable in one file.
- **Off switch.** `NEXT_PUBLIC_ANALYTICS_ENABLED=false` disables analytics entirely (for self-hosting / opt-out).

### Privacy pre-flight — COA-96 (analytics)
1. **What leaves:** anonymous page-view events (templated path, referrer, coarse geo/device; cookieless daily hash) → Vercel. No repo identifiers (scrubbed) and no repo content.
2. **Where:** Vercel Web Analytics + Speed Insights (`/_vercel/insights`, `/_vercel/speed-insights`).
3. **Minimum:** path templated to the route, query/hash dropped, allowlist fail-closed; this is the smallest payload that still answers the product questions.
4. **Retention/training:** product analytics, not an AI path — no ZDR question; cookieless, aggregated, no training.
5. **Consent:** cookieless/anonymous (no consent banner needed); disclosed in the public [PRIVACY.md](../PRIVACY.md). Opt-out via the env switch.

## The native companion as a privacy feature

The phase-2 `zero-native` desktop app exists largely *for* privacy: it reads the local `.git` directly, so for local repos **nothing is uploaded at all**. When weighing features, remember this is the gold-standard mode and the web app should not regress the privacy story for users who could use local mode.

## Security hygiene (baseline)

- Treat any rendered repo content as untrusted input (commit messages, branch names, author fields) — sanitize before render to prevent injection.
- In the native companion, the WebView is untrusted by `zero-native`'s model; native capabilities are opt-in and permission-scoped. Preserve that posture — don't widen native permissions for convenience.
- Secrets and tokens never go in the client bundle or logs.
