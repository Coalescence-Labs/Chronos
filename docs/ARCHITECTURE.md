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
- **Two entry points:** paste a public repo URL; or link GitHub via OAuth and select a repo.
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

- **source** — public URL, GitHub API/clone, or (phase 2) local `.git`.
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
| 1 | **Graph layout algorithm** | This *is* "like Bitbucket, but better." Lane assignment, merge rendering, and ordering determine whether the glance works. | Study Bitbucket, `git log --graph`, and existing OSS graph libs before committing. Likely the highest-risk, highest-value module. |
| 2 | **Render technology** (SVG vs Canvas vs WebGL) | Large repos (10k+ commits) will tank naive SVG. But SVG is simplest for crisp, accessible, themeable output. | Possible: SVG for small/medium, Canvas/WebGL fallback for large. Decide with a perf budget, not vibes. |
| 3 | **Public-repo ingestion model** (server-side clone vs GitHub API vs client-side) | **Privacy-defining.** Server-side clone means repo data transits our infra. Client-side keeps it on the user's device. | Must be decided *with* [PRIVACY.md](PRIVACY.md). Default bias: minimize what touches our servers. |
| 4 | **AI feature surface** | The owner wants AI but never said what it does. Building a chatbot "because AI" violates the cognitive-load mandate. | Pick one concrete, load-reducing job first (e.g. "summarize this branch"). |
| 5 | **AI provider (ZDR)** | The privacy promise depends on a provider that contractually does zero retention / no training. | Verify ZDR in writing before integrating. Run the privacy pre-flight skill. |
| 6 | **Rate limits & caching** | Public-URL viewing + GitHub API both hit limits; caching strategy interacts with #3 and privacy. | Tie to ingestion decision. |
| 7 | **Auth/session for GitHub OAuth** | Token storage and scope minimization are privacy-sensitive. | Request least scopes; never store more than needed. |
| ~~8~~ | ~~License~~ | RESOLVED: **Apache 2.0** (see `LICENSE`). | Permissive + patent grant; maximizes adoption. |

## Performance posture

The promise is "at a glance" — so **time-to-first-useful-graph** is the headline metric. Big repos must not hang the main thread (consider web workers for layout). Set a perf budget when render tech (#2) is chosen.

## Module boundaries to preserve

- `lib/ingest/*` — source-specific adapters → normalized model. Swappable (URL / GitHub / local).
- `lib/graph/*` — pure layout over the normalized model. No DOM, no network. Unit-testable.
- `components/graph/*` — render + interaction over layout output.
- `lib/ai/*` — opt-in, ZDR-gated, isolated behind the privacy pre-flight.

Keeping `lib/graph` pure and DOM-free is what makes the phase-2 native companion cheap.
