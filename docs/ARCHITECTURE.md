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
                │           opt-in AI (ZDR) ──────┘          │
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
- **Optional AI** features, opt-in, ZDR-only.

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
- **AI** — optional, opt-in, ZDR. *(Open: feature surface + provider.)*

Keep these as **clean module boundaries** so ingestion source and render target can vary independently. The normalized model is the contract between them.

---

## Open Decisions

These are unresolved. Resolve them deliberately (with the owner), then move the answer into this doc and remove it from this list. Until then, agents must flag any code that implicitly assumes an answer.

| # | Decision | Why it matters | Notes / leanings |
|---|----------|----------------|------------------|
| ~~1~~ | ~~Graph layout algorithm~~ | RESOLVED: **hybrid lane assignment in our own pure `lib/graph` module** (no render-coupled lib). Stable columns for active/long-lived branches; compact reuse of freed lanes for stale branches; a **hard column cap** so the graph stays readable on mobile. Topological order with date tie-breaking. | Branch *identity* and the "active/long-lived" heuristic + cap value are tuning parameters, not blockers — pick simple defaults, make them adjustable, unit-test heavily (highest-risk module). |
| ~~2~~ | ~~Render technology~~ | RESOLVED: **SVG with viewport virtualization** (render only on-screen rows). Best fit for the DESIGN bar (theming, gradients, crisp strokes) and accessibility; virtualization + worker layout + progressive load (#3) keep big repos within budget without a second renderer. | Keep the renderer behind the `components/graph` interface so a Canvas/WebGL path can be added later **without touching `lib/graph`** — only if profiling proves SVG can't hold the perf budget. |
| ~~3~~ | ~~Public-repo ingestion model~~ | RESOLVED: **server-side BFF proxy** (revised — see #7). Our server proxies GitHub API calls; repo data flows GitHub → our server → browser **transiently, with zero server-side persistence or content logging**. v1 is GitHub-only. Large repos handled via **progressive loading** (render recent slice first, backfill in background). *(Originally resolved as client-side; flipped when #7 chose the BFF security posture, which requires the server to make the API calls.)* | Trade-off: weaker than client-side on "data off our servers," stronger on token security. Privacy pre-flight completed; the binding posture lives in [PRIVACY.md](PRIVACY.md). Caching (#6) is now server- and client-side. |
| 4 | **AI feature surface** | The owner wants AI but never said what it does. Building a chatbot "because AI" violates the cognitive-load mandate. | Pick one concrete, load-reducing job first (e.g. "summarize this branch"). |
| 5 | **AI provider (ZDR)** | The privacy promise depends on a provider that contractually does zero retention / no training. | Verify ZDR in writing before integrating. Run the privacy pre-flight skill. |
| 6 | **Rate limits & caching** | Public-URL viewing + GitHub API both hit limits; caching strategy interacts with #3 and privacy. | **Proposed ADR awaiting ratification:** [adr/006-bff-rate-limits-and-caching.md](adr/006-bff-rate-limits-and-caching.md). Repo-content caching remains unimplemented. Current reversible safeguards are bounded instance-local credential reuse, request/concurrency limits, deadlines and explicit 429 backoff; see [SECURITY.md](SECURITY.md). Deployment-wide coordination remains open. |
| ~~7~~ | ~~Auth/session for GitHub API access~~ | RESOLVED: **BFF (Backend-for-Frontend)** — the GitHub App connects personal and organization installations. GitHub user credentials and bindings stay in an encrypted httpOnly `gh-session` cookie, separate from WorkOS. Every private request checks authoritative WorkOS bindings/revocation version and live GitHub user access before using a repository-scoped installation token. Non-secret bindings and their authorization version live in WorkOS metadata. Metadata alone cannot restore GitHub credentials; reconnect is required when credentials are absent. Disconnect rotates the durable version across devices and attempts user-grant revocation; installations remain on GitHub. | Permissions: Contents: Read + Metadata: Read only. PKCE and expiring user credentials; no browser-readable tokens. See [AUTH.md](AUTH.md), [SECURITY.md](SECURITY.md) and the completed [privacy pre-flight](PRIVACY.md). |
| ~~8~~ | ~~License~~ | RESOLVED: **Apache 2.0** (see `LICENSE`). | Permissive + patent grant; maximizes adoption. |

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
- `lib/ai/*` — opt-in, ZDR-gated, isolated behind the privacy pre-flight.

Keeping `lib/graph` pure and DOM-free is what makes the phase-2 native companion cheap.
