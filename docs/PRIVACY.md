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

## Data-flow decisions still open

The single most important privacy decision — **how public repos are ingested** (server-side clone vs GitHub API vs client-side) — is **not yet made**. It is tracked as open decision #3 in [ARCHITECTURE.md](ARCHITECTURE.md) and must be resolved *together with this document*, not as an implementation detail. Default bias: keep repo data off our servers wherever feasible.

## The native companion as a privacy feature

The phase-2 `zero-native` desktop app exists largely *for* privacy: it reads the local `.git` directly, so for local repos **nothing is uploaded at all**. When weighing features, remember this is the gold-standard mode and the web app should not regress the privacy story for users who could use local mode.

## Security hygiene (baseline)

- Treat any rendered repo content as untrusted input (commit messages, branch names, author fields) — sanitize before render to prevent injection.
- In the native companion, the WebView is untrusted by `zero-native`'s model; native capabilities are opt-in and permission-scoped. Preserve that posture — don't widen native permissions for convenience.
- Secrets and tokens never go in the client bundle or logs.
