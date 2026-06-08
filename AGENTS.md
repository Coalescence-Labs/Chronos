# AGENTS.md — Chronos operating manual

This is the canonical guide for any agent or contributor working in Chronos. If something here conflicts with a stray comment or assumption, **this wins**. Keep it current: when a decision in the "Open Decisions" list gets made, move it into the relevant doc and delete it from the open list.

---

## 1. What Chronos is (one paragraph)

A beautiful, hosted, web-first git **branch-graph visualizer** that lets anyone understand a repo at a glance — paste a public repo URL or link GitHub, on laptop or phone. Optimized for **high information density at low cognitive load**. Privacy-first; optional AI under strict ZDR. Free and open source. See [docs/PRODUCT.md](docs/PRODUCT.md).

## 2. Decided vs. open — read this before writing code

The product direction is set. Most *technical* choices are **not yet made**. Do not assert open decisions as settled — that misleads every future agent. When you must proceed past an open decision to make progress, pick the simplest reversible option, **say so explicitly in your output**, and leave the decision open until a human ratifies it.

### Decided (by the project owner)
- **Web-first**, hosted on Vercel; **Next.js / React**.
- **`zero-native` desktop companion is phase 2** and *additive* — it wraps the same web UI for a local-`.git` privacy mode. Not a v1 blocker.
- Two repo entry points: **paste a public repo URL** and **link GitHub (OAuth) → pick a repo**.
- **Responsive**: must feel native on phone *and* laptop.
- **Privacy-first**; AI features are **opt-in** and **ZDR-only**.
- **Free hosted + open source.**
- **Runtime: Bun** (package manager + test runner). Never npm/yarn/node/ts-node.
- Design language: **organic-futuristic-modernism** — calm, powerful, intentional (see [docs/DESIGN.md](docs/DESIGN.md)).

### Open (do NOT invent answers — see docs/ARCHITECTURE.md "Open Decisions")
- Graph **layout algorithm** (the actual hard core of "like Bitbucket, but better").
- **Render technology**: SVG vs Canvas vs WebGL (affects large-repo performance).
- **Public-repo ingestion model**: server-side clone vs GitHub API vs client-side — this is a *privacy-defining* choice, not a detail.
- **AI feature surface**: what AI actually does (branch summaries? history explanations? Q&A?) — never specified.
- **AI provider** that satisfies ZDR.
- **License** (open-source license not yet chosen).

## 3. Conventions

- **Runtime:** `bun install`, `bun run dev`, `bun test`. Bun auto-loads `.env`.
- **Language:** TypeScript, strict.
- **Style:** match surrounding code; comment density and naming should be indistinguishable from neighboring files. Don't add narration comments.
- **Commits/PRs:** branch off the default branch before committing; only commit/push when asked.
- **Tests:** colocate or under `tests/`; prefer `bun test`. Write tests for graph-layout logic especially — it's the core and the easiest place for subtle bugs.

## 4. Repository map (intended)

```
Chronos/
  README.md                 # public overview
  CLAUDE.md                 # thin agent entry point -> points here
  AGENTS.md                 # this file
  docs/
    PRODUCT.md              # vision + philosophy
    ARCHITECTURE.md         # how it's built + OPEN DECISIONS
    DESIGN.md               # visual language + polish bar
    PRIVACY.md              # security + ZDR model
  .claude/skills/
    privacy-preflight/      # MANDATORY guardrail before AI / new data egress
  app/                      # (future) Next.js App Router
  lib/                      # (future) graph engine, git ingestion, AI
  components/               # (future) UI
```
Application directories don't exist yet — create them as work begins, and update this map.

## 5. Non-negotiables

1. **Privacy pre-flight is mandatory.** Before any AI feature or any new data-egress path, run `.claude/skills/privacy-preflight/`. See [docs/PRIVACY.md](docs/PRIVACY.md).
2. **Polish is part of "done."** A feature that works but feels rough is not done. See [docs/DESIGN.md](docs/DESIGN.md).
3. **Respect the cognitive-load mandate.** Every UI addition must *reduce* confusion, not add a knob. If it adds a knob, justify it.
4. **Don't invent open decisions into "fact."** Flag them.

## 6. zero-native (phase 2) — keep it thin

`zero-native` is pre-release (Zig native shell + web UI; experimental mobile). Treat it as additive: it reuses the v1 web UI to give a **local desktop mode** that reads `.git` directly with zero upload. **Do not write integration/build specifics against its API yet** — they'd be guesses against an unstable surface. Build the web app so its UI layer is portable (no hard dependency on hosted-only APIs in the rendering path).
