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
- Two repo entry points: **paste a public GitHub repo URL** and **link GitHub (OAuth) → pick a repo**. (v1 is GitHub-only — see decision #3.)
- **Ingestion is a server-side BFF proxy to the GitHub API** (decisions #3 + #7) — server proxies GitHub calls with **zero persistence/logging of repo data**; v1 is GitHub-only; large repos use progressive loading. (Originally client-side; flipped for the BFF token-security posture below.)
- **GitHub App connect uses the BFF pattern** (decision #7) — user installs the Chronos GitHub App for personal and organization accounts; bindings and GitHub user credentials are sealed in encrypted httpOnly `gh-session` (separate from WorkOS). BFF verifies the user's repo access before minting short-lived installation tokens with the App private key — never exposed to browser JS; permissions Contents: Read + Metadata: Read only. Account-linked private-repo connect is COA-202 (privacy pre-flight in PRIVACY.md).
- **Optional Chronos user accounts use WorkOS AuthKit** (COA-200) — email/password, GitHub, Google via hosted AuthKit; sealed httpOnly session cookie; public paste remains anonymous. See [docs/AUTH.md](docs/AUTH.md). Distinct from GitHub *repo* OAuth (COA-79 / COA-202).
- **Graph layout is a hybrid lane algorithm in our own pure `lib/graph`** (decision #1) — stable columns for active branches, compact reuse for stale, hard column cap for mobile. No render-coupled libs.
- **Render is SVG with viewport virtualization** (decision #2) — render only on-screen rows; renderer stays behind the `components/graph` interface so it's swappable without touching `lib/graph`.
- **Responsive**: must feel native on phone *and* laptop.
- **Privacy-first**; AI features are **opt-in**; long-term **ZDR-only**. Beta Graph Q&A (public repos only until written ZDR): [docs/AI.md](docs/AI.md).
- **Chronos Agent beta infra** — Vercel AI Gateway; Claude Sonnet 5.5 + Haiku 5.5; Upstash spend ledger ($5/user/mo, `chronos:` prefix); Jev + fact tools; Account opt-in + kill switch. Detail in [docs/AI.md](docs/AI.md).
- **Free hosted + open source** under **Apache 2.0** (see `LICENSE`).
- **Runtime: Bun** (package manager + test runner). Never npm/yarn/node/ts-node.
- Design language: **organic-futuristic-modernism** — calm, powerful, intentional (see [docs/DESIGN.md](docs/DESIGN.md)).

### Open (do NOT invent answers — see docs/ARCHITECTURE.md "Open Decisions" and docs/AI.md)
- **AI feature surface beyond Graph Q&A beta** (other products; Agent UX directions A–E; generative-UI ambition).
- **Written ZDR** for the AI provider (required before private-repo Agent / ending the public-only beta carve-out).

## 3. Linear is the project backbone

Linear is how Chronos work stays visible — for humans and for AI agents. Treat tickets as the source of truth for *what* is in flight; keep them honest as you go. Cursor agents also get a short always-on reminder in [`.cursor/rules/linear-backbone.mdc`](.cursor/rules/linear-backbone.mdc); **this section is canonical**.

**Team / project:** Coalescence Labs · project **Chronos**.

### Before you start
- Search Chronos issues first; **dedup** before creating.
- If nothing fits, create a ticket with a clear why/scope. Prefer linking related issues over parallel duplicates.
- Set status to **In Progress** when you actually start.

### While you work
- Comment findings, blockers, and decisions worth keeping (not play-by-play noise).
- Link the PR on the ticket when one exists; move to **In Review** when the PR is open.
- Do not invent answers to open architecture decisions (see §2 and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- Privacy pre-flight remains mandatory for AI features and any new data egress (see §6 and [docs/PRIVACY.md](docs/PRIVACY.md)).
- **Owner-owned UI** (home, logo, multi-repo UX, and any ticket that says so): wait for owner direction before implementing UI. Ramp and mechanical help under direction are fine; inventing the design is not.

### Done means done
- **Done** only when the change is **merged and verified** (not “PR opened”, not “tests green locally if the merge is broken”).
- Never mark broken or incomplete work Done. If review finds issues, keep **In Review** (or return to **In Progress**) and say so on the ticket.

## 4. Conventions

- **Runtime:** `bun install`, `bun run dev`, `bun test`. Bun auto-loads `.env`.
- **Language:** TypeScript, strict.
- **Style:** match surrounding code; comment density and naming should be indistinguishable from neighboring files. Don't add narration comments.
- **Commits/PRs:** branch off the default branch before committing; only commit/push when asked. Prefer Linear identifiers (e.g. `COA-123`) in branch/PR titles when a ticket exists.
- **Branch names:** use a lowercase purpose prefix: `feature/`, `bugfix/`, `hotfix/`, `maintenance/`, `perf/`, `refactor/`, `docs/`, `test/`, or `ci/`, followed by a kebab-case description. Include the lowercase Linear identifier when available, e.g. `perf/coa-236-speed-up-page-transitions`. Never create or push a branch whose name starts with `t3code`. If tooling creates one automatically, rename it to a permitted name before committing or pushing; tool defaults do not override this rule.
- **Tests:** colocate or under `tests/`; prefer `bun test`. Write tests for graph-layout logic especially — it's the core and the easiest place for subtle bugs.

## 5. Repository map (intended)

```
Chronos/
  README.md                 # public overview
  CLAUDE.md                 # thin agent entry point -> points here
  AGENTS.md                 # this file
  .cursor/rules/            # Cursor always-on agent rules (Linear backbone, etc.)
  docs/
    PRODUCT.md              # vision + philosophy
    ARCHITECTURE.md         # how it's built + OPEN DECISIONS
    DESIGN.md               # visual language + polish bar
    PRIVACY.md              # security + ZDR model (+ Agent beta carve-out)
    AI.md                   # Chronos Agent infra: decided vs open
    AUTH.md                 # WorkOS AuthKit accounts (COA-200)
    PERFORMANCE.md          # navigation baseline, <250ms goal, proposed improvements
    SECURITY.md             # dependency gate, credential lifecycle, limits, deployment verification
    adr/                    # decision records (006 = rate limits & caching, proposed)
  .claude/skills/
    privacy-preflight/      # MANDATORY guardrail before AI / new data egress
  app/                      # Next.js App Router (globals.css = design tokens; api/repo = BFF proxy; api/mcp = local git MCP, off unless configured; /callback + /sign-in AuthKit; /account; /styleguide; /repo/[owner]/[repo] = graph view; /demo = synthetic graph, no network)
  lib/
    graph/                  # pure layout engine (layout.ts, hybrid lanes) + normalized model (types.ts) — no DOM/network
    ingest/                 # source adapters -> normalized model (GitHub via BFF)
    auth/                   # WorkOS AuthKit session helpers (public /me shape; no tokens to client)
    github-app/             # verified installs, revocation versions, sealed credentials, bounded token coordination/transport
    security/               # mutation origin checks, CSP, ephemeral request fairness limits
    demo/                   # deterministic synthetic history backing /demo
    ai/                     # thin re-exports; Agent lives in lib/agent (see docs/AI.md)
    agent/                  # Graph Q&A: gate, Jev, facts, orchestrate, spend
    mcp/                    # owner-only MCP endpoint for local, allowlisted read-only git (open decision #9)
  components/
    background/             # HomePageBackground: cached Chronos graph geometry + frosted layer
    graph/                  # GraphView: virtualized SVG renderer over layout output
    repo/                   # GraphExplorer (on-demand Glance worker -> layout -> GraphView -> inspector), RepoScreen (live ingest), RepoUrlForm (intent prefetch)
    auth/                   # AuthProvider + minimal AccountControls (no multi-repo switcher) + GitHubConnectionCard (/account)
    ui/                     # design-system primitives (Surface, Button, InspectionSurface, states)
    shell/                  # AppShell (responsive scaffold)
    pwa/                    # service-worker registration
  proxy.ts                  # Next.js 16 AuthKit session refresh (auth optional; public routes stay open)
  docs/AUTH.md              # WorkOS accounts, MFA/passkeys investigation, GitHub-login vs repo-OAuth split
  public/                   # fonts (Satoshi), PWA icons, sw.js
  scripts/                  # generate-icons.ts (PWA icons), capture-home-graph.ts (offline origin/main geometry)
                            # benchmark-performance.ts (synthetic production navigation + graph compute)
                            # audit-security.ts (production advisory gate + expiring development exception)
  tests/                    # bun test suites (boundaries, ingest, design tokens, pwa, graph layout/view/pipeline)
    e2e/                    # Playwright (*.e2e.ts; bun run test:e2e) — phone + laptop projects, BFF mocked
```
Keep this map current as directories are added.

## 6. Non-negotiables

1. **Privacy pre-flight is mandatory.** Before any AI feature or any new data-egress path, run `.claude/skills/privacy-preflight/`. See [docs/PRIVACY.md](docs/PRIVACY.md).
2. **Polish is part of "done."** A feature that works but feels rough is not done. See [docs/DESIGN.md](docs/DESIGN.md).
3. **Respect the cognitive-load mandate.** Every UI addition must *reduce* confusion, not add a knob. If it adds a knob, justify it.
4. **Don't invent open decisions into "fact."** Flag them.
5. **Keep Linear current.** Find/create the Chronos ticket, update status, link the PR — see §3.

## 7. zero-native (phase 2) — keep it thin

`zero-native` is pre-release (Zig native shell + web UI; experimental mobile). Treat it as additive: it reuses the v1 web UI to give a **local desktop mode** that reads `.git` directly with zero upload. **Do not write integration/build specifics against its API yet** — they'd be guesses against an unstable surface. Build the web app so its UI layer is portable (no hard dependency on hosted-only APIs in the rendering path).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
