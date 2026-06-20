# Testing & Quality

Chronos is built to a simple bar: **a feature that works but feels rough — or quietly regresses — is not done.** This page is an honest tour of how the project is tested, so contributors, reviewers, and anyone evaluating the codebase can see the quality has concrete backing.

Every pull request runs the full gate in CI — **lint → typecheck → unit/integration tests → production build → end-to-end tests** — on a clean machine. Nothing merges red.

```bash
bun test          # unit + integration (fast; no browser, no network)
bun run test:e2e  # Playwright end-to-end (phone + laptop)
bun run lint:check && bun run typecheck && bun run build
```

- **200+ unit/integration tests** across ~20 files, hermetic (no real network — GitHub is mocked).
- **End-to-end tests** run on **two viewports** — a phone (390×844, touch) and a laptop (1440×900, pointer + keyboard) — against a real production build.
- Runtime is **Bun** throughout (`bun test`); e2e is **Playwright**.

---

## How the testing is layered

Chronos separates concerns so each layer can be tested at the right altitude — pure logic without a DOM, the data pipeline without a network, and the real product in a real browser.

### 1. The graph engine — pure, and tested hardest

The layout engine (`lib/graph`) is the heart of the product and the highest-risk code, so it's pure (no DOM, no network) and covered from several angles:

- **Invariant tests** pin specific shapes — linear history, merges, lane reuse, the hard column cap, clock skew, truncation, determinism.
- **Property-based tests** throw *hundreds of randomly generated, valid commit DAGs* at the engine and assert the invariants hold for all of them — every commit placed once, children always above parents (even under clock skew), lanes within bounds, edge endpoints valid, open edges only for unloaded parents, and identical output for identical input. Failures report a **seed** so any case is reproducible.
- **Branch attribution** (which commits belong to which branch line, including names recovered from merge-commit messages) and the **glance-mode transform** (hide-merged / collapse-staged) have their own focused suites.

### 2. Module boundaries & design system — enforced by tests

Some architectural promises are guarded automatically, so they can't quietly erode:

- **Boundary test** — `lib/graph` must stay free of DOM, network, and framework imports (a regex gate over its imports).
- **Design-token test** — components may not hard-code colors; every color must come from a CSS variable, so theming stays consistent.
- **WCAG contrast test** — computes relative-luminance contrast ratios for the **dark and light (Sumi-e) themes** and asserts AA thresholds (4.5:1 body text, 3:1 large text / UI), so a palette tweak that washes out text fails CI.

### 3. Ingestion & the privacy posture

The server-side BFF proxy to GitHub is tested for correctness *and* for the privacy promises:

- **Mapping & contract** — raw GitHub payloads are reduced to the normalized model; the route responses match their typed contract.
- **Privacy guardrails** — tests assert the proxy forwards **only** graph-relevant fields (never file contents/diffs), and never leaks tokens or repo content into responses or logs. `Cache-Control: no-store` is verified.
- **URL parsing** — the input parser (the injection boundary before any GitHub call) accepts the many valid URL/SSH/shorthand forms and rejects malformed or hostile input.
- **Edge cases** — empty/unborn repositories (409 → empty graph, not an error), rate-limit mapping (incl. the computed `retryAfterSeconds`), and page bounds.

### 4. Rendering & interaction (end-to-end)

The Playwright suite drives the real app on both viewports and covers the things only a browser can prove:

- Paste a public repo URL → a branch graph renders; inspect a commit (bottom sheet on phone, side panel on laptop).
- **Progressive loading** — only the eager pages are fetched up front; deeper history loads lazily on scroll, and a failed `loadMore` re-arms and recovers on retry.
- **Branch tracing** — tap the graph side of a row (or a badge) to highlight a branch; the message side opens the commit; toggling off always returns to the default view.
- **Glance mode** — landed branches collapse to a clean spine, staged features fold to capsules, and toggling reflows the graph.
- **Mobile interaction** — long-press to peek a commit, tap-to-copy the SHA, the collapsible theme toggle, and the status bar matching the active theme.
- **Designed states** — empty repository and upstream errors show the intended UI (with retry), not a stack trace.

### 5. Performance & accessibility budgets

- **Perf budget** — laying out a **~20,000-commit** history is asserted to stay within budget (it runs in ~115 ms on a Raspberry Pi 5; the test guards a 4× headroom ceiling), which is why layout runs on the main thread without a worker.
- **Automated a11y** — an **axe-core** scan runs on the key surfaces in **both themes and both viewports**, failing on serious/critical violations. (Two rules are deferred deliberately and documented in the test: contrast — governed by the dedicated tiered-contrast test above — and the listbox/trace-button nesting tradeoff.)
- **Reduced motion** — a test confirms `prefers-reduced-motion` neutralizes the graph's micro-animations while the behavior still works.

---

## What runs in CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | Steps |
|---|---|
| `check` | install → **lint** → **typecheck** → **`bun test`** → **build** |
| `e2e` | install → cache + install the Playwright browser → **`bun run test:e2e`** (phone + laptop) → upload the report on failure |

A change that breaks an interaction, regresses contrast, leaks repo data through the proxy, or violates a module boundary fails the gate before it can merge.

---

## Conventions for contributors

- **Write tests at the right layer.** Pure logic (especially graph layout) gets unit/property tests; pipeline behavior gets integration tests against mocked GitHub; interaction gets e2e.
- **Keep `lib/graph` pure** — no DOM/network/framework imports (the boundary test enforces it).
- **Tokens, not hex** — colors come from CSS variables (the design-token test enforces it).
- **CSS-module class names render empty under `bun test`** — assert structure, ARIA, and `data-*` attributes, not class names.
- **New data-egress paths require a privacy pre-flight** before merge — see [docs/PRIVACY.md](docs/PRIVACY.md).
