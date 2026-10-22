# Chronos performance investigation

**Observed:** 2026-10-12, America/Los_Angeles (2026-10-13 UTC).
**Tracking:** [COA-236](https://linear.app/coalescence-labs/issue/COA-236/chronos-large-repository-state-and-progressive-overview-organic-llm),
with [COA-98](https://linear.app/coalescence-labs/issue/COA-98/chronos-track-key-performance-metrics-time-to-first-graph-layout-cost),
[COA-74](https://linear.app/coalescence-labs/issue/COA-74/decision-rate-limit-and-caching-strategy-for-the-bff-proxy),
and [COA-86](https://linear.app/coalescence-labs/issue/COA-86/chronos-custom-loading-page-skeleton-states).
A separate investigation issue could not be created because Linear rejected
creation at the workspace's free issue limit. COA-236 remains In Progress.

The owner wants every page transition below **250ms**, including slower
connections, without compromising quality or reliability. This investigation
adds a reproducible baseline; it does not implement the optimizations below or
ratify ADR 006. The simplest reversible measurement choice is local Chromium
with synthetic data and explicit network/CPU throttling. Real devices and
deployment measurements remain necessary.

## GitHub connection hardening check — 2026-10-18

The hardened BFF regression fixture measures **five GitHub calls for a cold
private-repo load** (user visibility, scoped token mint, branches, tags, commits)
and **two for each subsequent commit page** (fresh user visibility plus commits).
A warm scoped token removes the mint call. Each BFF request still reads
authoritative WorkOS metadata; token reuse never skips user authorization. These
counts exclude expired-user-token refresh and connection-status checks.

The strict nonce CSP requires dynamic HTML. A local production build on Next.js
16.4.2, Bun 1.4.2 and Chromium 156 was checked with the same synthetic gateway and
device profiles below, three samples per case. Median destination paint was
47ms for laptop home → repo, 546ms for the throttled phone, and 42ms for the
phone after explicit repo intent prefetch. Phone first graph was 841ms without
intent prefetch and 332ms with it; phone home → idle-prefetched demo was 99ms.
These are diagnostic samples, not field percentiles or a 250ms guarantee. They
remain close to the earlier baseline; slow-network navigation and source-page
startup still need the separate performance work described below. No GitHub,
WorkOS or analytics traffic was used by this benchmark.

## What the target measures

Measure these independently, starting at the user's input:

| Metric | Endpoint | What success means |
| --- | --- | --- |
| Destination paint | A frame containing the destination content or its honest loading state | Navigation visibly responds within 250ms. |
| First useful graph | A painted graph with usable selection/inspection | The graph itself is ready; a skeleton does not count. |
| Current data readiness | Requested fresh refs/history received and reconciled | Correct freshness, separate from navigation. |
| Interaction latency | Input to painted inspection, trace, scroll, zoom or Glance update | Fast after arrival, even during background ingestion. |

The 250ms goal should be checked against **every measured transition**, alongside
median, p95, p99 and maximum as sample counts grow. A percentile passing does
not mean every transition passes. Define the supported network/device envelope
before making a public guarantee. If an uncached request's round trip exceeds
250ms, fresh remote content cannot arrive within that budget. Locally ready
content and prefetched destination shells can still respond quickly. Cold
entry, external sign-in/install redirects, expired sessions and unavailable
networks need separate reporting, not exclusion disguised as success.

## Initial production-build baseline

Next.js **16.2.7**, Bun **1.4.2**, Chromium **148.0.7778.96**, macOS arm64,
**Apple M1 Pro**. Five samples per scenario, fresh browser context per sample.
At this count, nearest-rank p95 equals the maximum and is only a diagnostic
observation, not a statistically established field percentile.

Profiles:

- Laptop: 1440 × 900, local network, no CPU slowdown.
- Phone viewport: 390 × 844, **150ms CDP request latency**, **1.6Mbps download**,
  **750Kbps upload**, **4× CPU throttling**. This is desktop emulation, not a
  measured phone.

| Transition | Laptop destination, median / max | Phone destination, median / max | Phone first graph, median / max |
| --- | --- | --- | --- |
| Home → demo, after source hydration, no idle wait | 53 / 64ms | 538 / 551ms | 538 / 551ms |
| Home → demo, after network idle | 63 / 68ms | 104 / 112ms | 104 / 112ms |
| Home → pasted repo | 22 / 23ms | 543 / 578ms | 839 / 885ms |
| Demo → home, after source hydration, no idle wait | 41 / 42ms | 425 / 459ms | — |

The repo is a synthetic 100-commit chain. The BFF gateway adds a fixed **200ms
delay**; it does not exercise GitHub, installation-token minting or WorkOS.
Laptop first graph for that case was 261ms median / 265ms maximum.

The idle demo case transferred **zero new bytes after input** in all samples.
The non-idle phone demo case still needed approximately **28KB** of measured
transfer after input. This supports prefetch readiness as a substantial source
of delay; it does not establish that network time is the only cause. A completed
individual RSC resource is recorded in raw output but does not prove the whole
destination is prefetched. The idle case waits for all observed requests to
settle.

Source-page startup on the phone profile was approximately **2.9–3.0 seconds**
through document load and a verified theme interaction. This is a diagnostic
startup measure, not FCP, LCP or an exact browser-only hydration metric. Each
source page downloaded **249,860 bytes of fonts**. The built home HTML contains
ten font preload links. Those fonts alone require about **1.25 seconds** of
ideal transfer at 1.6Mbps before latency or competing resources. The gzip
gateway's measured source transfers were roughly **445–468KB**, including
resources/prefetches completed by the transition.

Phone demo transitions also contained observed main-thread tasks up to **72ms**.
Fast destination paint does not imply smooth interaction or absence of stalls.

### Graph computation

One untimed warm-up followed by five sequential samples in **Bun**, without
Chromium CPU throttling. The sequence measures the eager Glance transform,
normal layout and branch attribution; it excludes React, SVG painting, the
telemetry-only extra layout, and mobile's second lane-cap layout.

| Synthetic topology | Commits / refs | Glance median / max | Layout median / max | Combined median / max |
| --- | --- | --- | --- | --- |
| Linear first page | 100 / 2 | <1 / <1ms | <1 / <1ms | <1 / <1ms |
| Heavy merges | 1,005 / 2 | <1 / <1ms | 1.1 / 1.3ms | 1.7 / 2.0ms |
| Heavy merges | 5,005 / 2 | 1.3 / 1.4ms | 3.6 / 8.2ms | 5.8 / 10.6ms |
| Heavy merges | 20,007 / 2 | 4.9 / 7.7ms | 12.5 / 15.8ms | 21.8 / 25.0ms |
| Develop plus 1,000 retained feature refs | 5,005 / 1,003 | **365 / 390ms** | 3.1 / 6.2ms | **370 / 395ms** |

Commit count alone is an inadequate budget. The last fixture makes Glance
calculate overlapping reachability/spine sets for many live tips. Its eager
computation exceeds the entire navigation goal even on this laptop. It exceeds
today's first-page ref cap and anticipates COA-236's inventory expansion; these
numbers do not claim today's live BFF delivers 1,003 refs or that any named
repository takes exactly this time. Preserve Glance's staging/merge semantics
when optimizing it.

## Findings and proposed sequence

1. **Make the measurements match the promise.** `RepoScreen` starts its clock
   after navigation/mount and sends `graph_ready` from `onProgress` immediately
   after `setLoaded`, before React commits or paints. Its smallest duration
   bucket is `<500ms`, so it cannot evaluate 250ms. `GraphExplorer` reruns layout
   just to measure it. Measure the actual computation once and carry input time
   through navigation; measure committed/painted readiness separately. Keep
   local diagnostics exact and production telemetry allowlisted/bucketed, with
   privacy pre-flight before expanding the analytics surface. Add meaningful
   dedicated-browser budget checks after the baseline stabilizes; do not call
   development-server timings production results.

2. **Prepare likely destinations and preserve a responsive shell.** The form
   currently only calls `router.push`; there is no `app/**/loading.tsx`. Start
   with route/code prefetch for a validated, intentional destination and an
   existing-design loading boundary. Touch/keyboard users need the same path
   as pointer users. Keep the shell interactive and navigation interruptible.
   Route prefetch must remain render-pure: typing a URL must not silently
   start repo ingestion or an auth/install action. Coordinate loading treatment
   with COA-86 and owner-owned home design. Next's documented mechanism is
   [prefetching plus loading boundaries](https://nextjs.org/docs/app/getting-started/linking-and-navigating);
   verify against our installed version, rather than adopting new experimental
   cache flags from the latest documentation.

3. **Avoid paying for optional computation before it is requested.** Gate
   Glance availability cheaply, compute/cache its transform when needed, and
   share reachability/spine work within one immutable history generation.
   Preserve the last correct graph while asynchronous work runs. The new
   breadth fixture provides evidence for evaluating a worker for large Glance
   workloads, rather than relying on the 20k-commit layout-only test. Worker
   messages must carry a generation so an old result cannot overwrite a
   refreshed repo or a newly selected view. Include serialization cost and
   memory when comparing a worker with incremental/algorithmic improvements.
   GraphView also scans all edges and lines on every scroll render despite
   virtualized DOM; profile an interval/window index before changing it.

4. **Reduce startup bytes without changing typography.** All ten Satoshi
   styles are currently preloaded globally. Retain the family, actual weights,
   italics and fallback metrics, but test demand-loading noncritical styles or
   splitting critical font groups. `next/font` supports
   [controlling preload](https://nextjs.org/docs/app/api-reference/components/font#preload).
   Check both themes, first paint, font swaps, inspector alignment, branch
   badges, CLS and slow/offline behavior. Asset reductions must not substitute
   synthetic bold/italic or remove needed glyph coverage. This is a proposal;
   no font setting was changed in this investigation.

5. **Shorten the data critical path and stop obsolete work.** The initial BFF
   resolves auth, awaits metadata, then loads refs and page 1 in parallel.
   Refs do not depend on the default-branch metadata: overlap them after auth,
   while retaining metadata/access/error validation. If a later design streams
   refs separately, represent coverage honestly; first useful graph must not
   wait for the entire inventory. The client eagerly fetches three trunk pages,
   then up to ten missing tips serially. Investigate bounded scheduling and
   cancellation with COA-236/74, preserve pinned-tip consistency and stop
   navigation-away work with actual aborts, not only ignored callbacks.
   Partial failures must not erase already verified facts or imply completion.
   Measure connected auth separately: each BFF request currently resolves the
   session and mints an installation token. Any bounded server-only token
   reuse must preserve installation/user isolation, expiration, revocation
   behavior and fail-closed private access.

6. **Make revisits fast only within an explicit freshness/privacy contract.**
   Repo history currently lives in `RepoScreen` state and refetches on remount.
   Consider bounded in-tab memory reuse for known snapshots, with explicit
   revalidation and invalidation on sign-out/disconnect/account changes.
   This is not an implemented or ratified cache policy. Coordinate with
   **COA-74 / proposed ADR 006** before adding repo caches. Private cache hits
   must never bypass authorization or cross accounts/installations. Refresh
   must genuinely bypass stale results; cached content cannot be presented as
   freshly verified. Keep `/api/*` and repo pages out of durable service-worker
   caches. Do not change the existing network-first shell policy casually:
   old HTML can reference chunks removed by a deployment.

These changes should precede a renderer replacement or framework rewrite.
The current hybrid layout/SVG boundaries support measured optimization without
changing the product's graph semantics or visual language.

## Reproduction

Use a local environment with WorkOS/GitHub credentials unset. Analytics is
disabled in the build. Keep this production server separate from port 3005's
development/e2e server:

```sh
bun install --frozen-lockfile
bun --bun x playwright install chromium
NEXT_PUBLIC_ANALYTICS_ENABLED=false bun --bun run build
bun --bun node_modules/next/dist/bin/next start -p 3015
```

In another terminal, from the same checkout:

```sh
mkdir -p test-results
BENCH_SAMPLES=5 bun run bench:performance > test-results/performance-baseline.json
```

`BENCH_ORIGIN` can point at another **local HTTP** server; remote targets are
rejected. `BENCH_SAMPLES` accepts 1–100. Raw output includes samples, transfer
sizes, configuration, browser version, machine and timestamp. `test-results/`
is ignored; the tables above retain this run's baseline in the repository.

The local gateway mocks BFF/analytics endpoints, forwards page/static requests
to Next, buffers responses and applies gzip to text/JS/JSON. Browser HTTP
caching stays enabled; using Playwright route interception would disable it
and distort revisit measurements. Service workers are blocked to isolate
router/HTTP caching. HTTPS requests are blocked. Source hydration is confirmed
by selecting the light theme; the timed transitions therefore use light theme.
Immediate scenarios begin after document load and that interaction, without
an additional idle wait; they are not pre-hydration clicks. Destination timing
starts at the captured click and ends one animation frame after the destination
is observed. This is a paint approximation, not a compositor timestamp. The
graph's inspector must then open and no browser page errors may occur.

## Remaining verification and release gates

- Measure all public routes and signed-in `/account`, restored/expired sessions,
  repository switching, back/forward, repeated views and deployment updates.
  This run covers only the four primary anonymous navigation scenarios above.
- Repeat on actual phone/laptop browsers and the deployed Vercel region,
  including cold functions, service workers enabled, higher latency, packet
  loss, Save-Data, slow first entry, offline and rapid repeated navigation.
  The buffered gateway cannot validate streaming or deployed TTFB.
- Use deterministic breadth/depth/churn fixtures plus opt-in, dated live runs
  for COA-236's references. Record inventory/ancestry coverage, request count,
  transferred bytes, current-data readiness, long tasks, memory and frame
  stability. A smaller or less correct graph is not a valid speed improvement.
- Keep graph/property/refresh tests, auth isolation, failure/retry/rate-limit
  handling, keyboard/touch targets, reduced motion and visual comparisons as
  gates for each implementation slice. Existing 800ms layout/render unit
  limits do not enforce the 250ms navigation goal or sub-50ms main-thread work.
- Compare alternatives using matched repo snapshots, coverage, tasks, hardware,
  connections and warm/cold/auth states. Benchmark useful inspection and
  complete/partial state as well as first paint. No competing product was
  benchmarked here; “faster than every other solution” is an ambition, not an
  established result.

Validation of the baseline investigation: production build, TypeScript, benchmark
script lint, all **374 Bun tests**, and **40 browser transition samples** with
post-paint inspector checks passed. No application runtime behavior changed.

## Approved implementation — 2026-10-13

The owner approved proposals **1 (Glance worker)** and **3 (navigation
preparation)**. Font preload changes and proposal 4's production measurement
changes remain deferred.

- `canApplyGlance` checks availability without running the transform. The
  controller and worker code load only on request. The existing pure transform
  executes in a same-origin worker; one result is reused for the current
  immutable history/default branch within the mounted explorer.
- Requests are generation-tagged. Turning Glance off, new history, a different
  repo or unmount cancels obsolete work; stale replies cannot replace the
  current view. During an in-place refresh the last applied snapshot stays
  visible while its replacement is calculated. A failure or 15-second timeout
  leaves the full current graph available and the Glance button permits retry.
  The loading timeout also covers the initial controller import.
- Home hydration warms demo and repo-view code. Valid paste, keyboard focus
  on Visualize or 150ms of pointer hover warms a validated repo route. Immediate
  pointer submission cancels hover work; duplicate route preparation is
  suppressed for 30 seconds. Ingestion still starts only after navigation.
- Repo pages share a persistent AppShell layout. The **additional `loading.tsx`
  proposed initially was removed**: repeated local measurements showed it added
  approximately 300ms to first graph readiness when navigation was unprepared.
  Existing RepoScreen loading/empty/error surfaces provide the loading UI.
  This is a measured implementation adjustment, not a new loading design.
- Intent preparation explicitly selects `PrefetchKind.FULL` because installed
  Next 16.2.7 defaults manual prefetch to AUTO. That enum comes from Next's
  internal typed router module; keep the build and real-browser prefetch tests
  as upgrade gates. Prefetch/render paths perform no GitHub ingestion.
- The home disclosure and [privacy pre-flight](PRIVACY.md#route-preparation-and-browser-local-glance)
  name the earlier route-address request and the browser-local computation.
  No API caches, persistent repo storage, permissions, tokens or telemetry
  fields were added.

### After measurements

Same machine, profiles and five samples as the initial baseline. The added
`home-repo-intent` case tabs from the filled input to Visualize and waits for
network idle before submission; this confirms actual keyboard intent rather
than programmatic focus after a pointer action. It does **not** include the
preparation wait in the click-to-destination duration. Prepared and unprepared
cases must remain separately reported.

| Phone scenario | Destination median / max | First graph median / max |
| --- | --- | --- |
| Home → demo without idle wait | 506 / 520ms | 506 / 520ms |
| Home → demo after network idle | 99 / 109ms | 99 / 109ms |
| Home → repo without preparation wait | 541 / 566ms | 829 / 865ms |
| Home → repo after keyboard-intent preparation | **36 / 37ms** | **329 / 330ms** |
| Demo → home without idle wait | 414 / 421ms | — |

Unprepared repo first graph is comparable to the baseline's 839ms median /
885ms maximum, rather than the 1.1-second result observed with the extra route
loading boundary. Small differences across five runs are diagnostic, not proof
of a statistically significant improvement. Source startup remains about
2.9 seconds and all 249,860 font bytes are unchanged. The entire 250ms goal is
**not met**: prepared page transitions pass here, but current remote data
readiness and unprepared navigation still need subsequent work.

Final measurements were recorded at 2026-10-14 05:05 UTC (2026-10-13 local).
The full phone/laptop Playwright suite passed (84 defined checks, with normal
device-specific skips), including a real worker run on 5,005 commits / 1,003
refs while inspection stays usable. All 381 Bun tests, production build,
typecheck and lint passed; lint retains six existing warnings.

Raw final measurements: local ignored
`test-results/performance-approved-1-3-release.json`. `BENCH_SCENARIO=home-repo`
filters the benchmark by scenario prefix; `BENCH_DEBUG=1` reports resource
timings to stderr. These use synthetic data only. The existing application
`graph_ready` timing and duplicate layout telemetry pass have not been changed;
those belong to proposal 4.
