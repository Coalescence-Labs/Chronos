# Architecture — Chronos

> This document describes the **decided** shape and, critically, the **open decisions** that are not yet made. An agent reading this should treat the "Open Decisions" section as questions, not answers. Do not paper over them.

---

## Shape (decided)

Chronos is **web-first** with a **native companion** planned later.

```
                ┌─────────────────────────────────────────┐
                │  CORE — hosted Next.js web app (Vercel)   │
                │                                           │
   public URL → │  ingestion → graph engine → render → UI   │ ← phone + laptop
  GitHub OAuth →│                                ▲          │   (responsive PWA)
                │     opt-in AI (ZDR long-term; see AI.md) ──┘│
                └─────────────────────────────────────────┘
                                  ▲
                                  │ reuses the SAME web UI
                ┌─────────────────────────────────────────┐
                │  COMPANION (phase 2) — zero-native shell  │
                │  reads local .git directly, zero upload   │
                └─────────────────────────────────────────┘
```

### Core (v1)
- **Next.js / React**, hosted on **Vercel**.
- **Two entry points:** paste a public **GitHub** repo URL; or link GitHub via OAuth and select a repo. (v1 is GitHub-only — see decision #3.)
- **Responsive PWA** — first-class on phone and laptop.
- **Optional AI** features, opt-in; long-term **ZDR-only**. Beta Graph Q&A stack: [AI.md](AI.md).

### Companion (phase 2 — keep thin)
- A [`zero-native`](https://github.com/vercel-labs/zero-native) desktop shell (Zig native layer + web UI) that **reuses the v1 web UI**.
- Its reason to exist: a **local privacy mode** — read the user's `.git` directly off disk, nothing leaves the machine. This is the strongest possible answer to the privacy mandate.
- `zero-native` is pre-release with experimental mobile support. **We do not write integration specifics yet.** The only architectural obligation v1 has: keep the **rendering/UI layer portable** — the graph engine and components must not hard-depend on hosted-only server APIs, so the same UI can later be fed by a local git reader.

## Logical pipeline (applies to every mode)

```
source → ingest → normalized commit/branch model → layout → render → interaction → (optional) AI
```

- **source** — public repo URL or GitHub-linked repo, fetched via a **server-side BFF proxy to the GitHub API** (decisions #3 + #7), with no server-side persistence of repo data; or (phase 2) local `.git`.
- **ingest** — turn raw git data into a normalized in-memory model (commits, refs, parents, branch tips, merges).
- **layout** — assign commits to lanes/rows; the heart of the product. *(Open.)*
- **render** — draw it. *(Open: SVG/Canvas/WebGL.)*
- **interaction** — hover/tap to inspect; progressive depth.
- **AI** — optional, opt-in; long-term **ZDR-only**. Beta Graph Q&A infra is documented in [AI.md](AI.md). *(Open: #4 remainder + #5 written ZDR; Agent UX directions.)*

Keep these as **clean module boundaries** so ingestion source and render target can vary independently. The normalized model is the contract between them.

---

## Open Decisions

These are unresolved. Resolve them deliberately (with the owner), then move the answer into this doc and remove it from this list. Until then, agents must flag any code that implicitly assumes an answer.

| # | Decision | Why it matters | Notes / leanings |
|---|----------|----------------|------------------|
| ~~1~~ | ~~Graph layout algorithm~~ | RESOLVED: **hybrid lane assignment in our own pure `lib/graph` module** (no render-coupled lib). Stable columns for active/long-lived branches; compact reuse of freed lanes for stale branches; a **hard column cap** so the graph stays readable on mobile. Topological order with date tie-breaking. | Branch *identity* and the "active/long-lived" heuristic + cap value are tuning parameters, not blockers — pick simple defaults, make them adjustable, unit-test heavily (highest-risk module). |
| ~~2~~ | ~~Render technology~~ | RESOLVED: **SVG with viewport virtualization** (render only on-screen rows). Best fit for the DESIGN bar (theming, gradients, crisp strokes) and accessibility; virtualization + worker layout + progressive load (#3) keep big repos within budget without a second renderer. | Keep the renderer behind the `components/graph` interface so a Canvas/WebGL path can be added later **without touching `lib/graph`** — only if profiling proves SVG can't hold the perf budget. |
| ~~3~~ | ~~Public-repo ingestion model~~ | RESOLVED: **server-side BFF proxy** (revised — see #7). Our server proxies GitHub API calls; repo data flows GitHub → our server → browser **transiently, with zero server-side persistence or content logging**. v1 is GitHub-only. Large repos handled via **progressive loading** (render recent slice first, backfill in background). *(Originally resolved as client-side; flipped when #7 chose the BFF security posture, which requires the server to make the API calls.)* | Trade-off: weaker than client-side on "data off our servers," stronger on token security. Privacy pre-flight completed; the binding posture lives in [PRIVACY.md](PRIVACY.md). Caching (#6) is now server- and client-side. |
| 4 | **AI feature surface (beyond beta)** | Building AI "because AI" violates the cognitive-load mandate. | **Partial:** beta = **Graph Q&A** over loaded history ([AI.md](AI.md)). Broader jobs and Agent UX (exploration A–E, generative-UI ambition) remain **open** — do not invent them. |
| 5 | **AI provider (written ZDR)** | The long-term privacy promise needs contractual zero retention / no training. | **Partial:** beta wires **Vercel AI Gateway** + Claude Sonnet 5.5 / Haiku 5.5. Written ZDR is still required before private-repo Agent or ending the public-only beta carve-out ([PRIVACY.md](PRIVACY.md), [AI.md](AI.md)). |
| 6 | **Rate limits & caching** | Public-URL viewing + GitHub API both hit limits; caching strategy interacts with #3 and privacy. | **Proposed ADR awaiting ratification:** [adr/006-bff-rate-limits-and-caching.md](adr/006-bff-rate-limits-and-caching.md). Repo-content caching remains unimplemented. Current reversible safeguards are bounded instance-local credential reuse, request/concurrency limits, deadlines and explicit 429 backoff; see [SECURITY.md](SECURITY.md). Deployment-wide coordination remains open. |
| ~~7~~ | ~~Auth/session for GitHub API access~~ | RESOLVED: **BFF (Backend-for-Frontend)** — the GitHub App connects personal and organization installations. GitHub user credentials and bindings stay in an encrypted httpOnly `gh-session` cookie, separate from WorkOS. Every private request checks authoritative WorkOS bindings/revocation version and live GitHub user access before using a repository-scoped installation token. Non-secret bindings and their authorization version live in WorkOS metadata. Metadata alone cannot restore GitHub credentials; reconnect is required when credentials are absent. Disconnect rotates the durable version across devices and attempts user-grant revocation; installations remain on GitHub. | Permissions: Contents: Read + Metadata: Read only. PKCE and expiring user credentials; no browser-readable tokens. See [AUTH.md](AUTH.md), [SECURITY.md](SECURITY.md) and the completed [privacy pre-flight](PRIVACY.md). |
| ~~8~~ | ~~License~~ | RESOLVED: **Apache 2.0** (see `LICENSE`). | Permissive + patent grant; maximizes adoption. |
| 9 | **Local git for agents (MCP)** | Organic's coding subagent (Reed) wants literal git views (`git status --short --branch`, `git log --graph`) of the owner's local checkouts. Hosted GitHub metadata cannot show working-tree state. | **Proposed, reversible:** `app/api/mcp` runs allowlisted read-only git (`lib/mcp/git.ts`) on repositories named in `CHRONOS_MCP_REPOS`, behind `CHRONOS_MCP_TOKEN`; absent otherwise, so the hosted app exposes nothing. Local `.git` access is officially the phase-2 companion's job; this does not decide that. Hosted git execution would need a sandboxed clone (e.g. Vercel Sandbox) and is not built. Pre-flight in [PRIVACY.md](PRIVACY.md#local-git-for-agents-mcp). |

### AI beta infra (ratified — detail in [AI.md](AI.md))

Not open decisions: Gateway + Sonnet/Haiku slugs; Upstash spend ledger (**$5/user/mo**, `chronos:` prefix); Account opt-in + kill switch; Jev + fact tools; **public-repos-only** beta until written ZDR. Agent UX chrome remains open (do not ship “2025 chat” as default product).

## Performance posture

The promise is "at a glance" — so **time-to-first-useful-graph** is the headline metric. Big repos must not hang the main thread (consider web workers for layout). Set a perf budget when render tech (#2) is chosen.

The owner's navigation goal is **every page transition below 250ms**, including
slower connections. The initial production-build baseline, measurement limits,
and proposed implementation sequence live in [PERFORMANCE.md](PERFORMANCE.md).
Destination paint and first useful graph are measured separately; a loading
surface alone does not meet the useful-graph goal. Cache policy remains proposed
under decision #6.

Approved performance batch (2026-10-13): Glance uses the same pure transform
in a browser worker loaded on request, with cancellation, generation checks and
one mount-scoped derived result. Layout remains synchronous. Validated repo
intent warms route/code only; history ingestion still begins on navigation.
Repo routes share an AppShell layout and retain RepoScreen's existing loading
surface. An additional route Suspense boundary was rejected after measurement
showed it delayed unprepared graph readiness by about 300ms.
See [PRIVACY.md](PRIVACY.md#route-preparation-and-browser-local-glance).

## Module boundaries to preserve

- `lib/ingest/*` — source-specific adapters → normalized model. Swappable (URL / GitHub / local).
- `lib/graph/*` — pure layout over the normalized model. No DOM, no network. Unit-testable.
- `components/graph/*` — render + interaction over layout output.
- `lib/ai/*` — thin AI flag / re-exports; live Agent orchestration is `lib/agent/*` (see [AI.md](AI.md)). Opt-in; privacy pre-flight mandatory; long-term ZDR.

Keeping `lib/graph` pure and DOM-free is what makes the phase-2 native companion cheap.
