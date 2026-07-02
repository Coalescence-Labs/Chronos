# Analytics — Chronos

> **Status:** plan + research. This document is the design for privacy-respecting product analytics in Chronos and the implementation guide for tickets **COA-96 / COA-97 / COA-98**.
>
> **The one rule that governs everything below:** analytics is a new path that could send data off the user's machine, so it is bound by [docs/PRIVACY.md](PRIVACY.md). We collect **enums, counts, and durations only — never repo names, SHAs, commit messages, authors, tokens, or any PII.** Where the default behavior of an analytics tool would leak repo data, we scrub it at the source.

---

## 1. Why analytics at all

Chronos has one north star — *understanding per glance* — and a hard privacy promise. We cannot improve the first or keep the second honest if we are flying blind on aggregate behavior. We want answers to a small, specific set of product questions, each of which can be answered with anonymous aggregates:

- **Does the core promise land?** What is the **time-to-first-graph** for a real repo, on phone vs. laptop, at the P75/P95 percentiles? This is the headline metric — "at a glance" is a latency claim.
- **Where do people fall out of the funnel?** Of users who submit a repo, how many reach a rendered graph? How many hit an error, and *which* error (rate limit, not found, network, parse)?
- **Which entry point is used?** Paste-a-URL vs. link-GitHub — where should we invest?
- **Is progressive loading working?** How deep do users scroll / how many lazy pages load before they stop?
- **Are the inspection affordances discovered and used?** glance / trace / inspect / peek / theme-change — do people find progressive depth, or is it invisible?
- **Is the demo doing its job?** Do `/demo` views convert to a real repo submission?
- **How often do we hit GitHub rate limits?** This drives caching (open decision #6) and capacity planning.

If a question cannot be answered without collecting something on the prohibited list, we **do not answer it** — we find an aggregate proxy or we drop it.

---

## 2. What we will and will NOT collect

This is the binding contract for every event and every property. It is enforced in code by a single chokepoint (`lib/analytics.ts`, §5) — nothing reaches Vercel except through it.

### Will collect (safe)

- **Enums** — a fixed, allowlisted vocabulary: entry source (`url` | `github`), error code (`rate_limit` | `not_found` | `network` | `parse` | `unknown`), interaction kind (`glance` | `trace` | `inspect` | `peek`), theme (`dark` | `light` | `system`), device class (`phone` | `laptop`).
- **Counts** — integers with no identifying meaning: lazy-page depth, commit-count bucket (bucketed, never exact — e.g. `lt_100`, `100_1k`, `1k_10k`, `gt_10k`), lane-count bucket.
- **Durations** — milliseconds: time-to-first-graph, layout cost, fetch wait.
- **Anonymous environment** — already provided by Vercel from the request (country, OS, browser, device) with a daily-rotating, non-cross-site hash. We add nothing to this.

### Will NOT collect (ever)

- Repo **owner** or **name**, full repo URL, or any slug from `/repo/[owner]/[repo]`.
- Commit **SHAs**, **messages**, **diffs**, **branch names**, **tag names**, **author / committer** identity (name, email, avatar).
- The GitHub **OAuth token** or session contents, or anything derived from them.
- Any **PII**, free-text the user typed, IP addresses, or persistent cross-day / cross-site identifiers.
- **Exact** repo size or any value precise enough to fingerprint a specific repo — sizes are always bucketed.

> Rule of thumb: if a value could be used to figure out *which repo someone looked at* or *who they are*, it does not leave the browser. When in doubt, bucket it or drop it.

---

## 3. The tooling: Vercel Web Analytics + Speed Insights

We use Vercel's first-party analytics because it is **cookieless and privacy-friendly by default**, requires no third-party service, and integrates with the existing Vercel deployment.

### How Vercel Web Analytics works

- **No cookies.** Visitors are identified by a hash derived from the incoming request; the hash is **valid for a single day and then reset**, so visitors cannot be tracked across days or across sites. ([How visitors are determined](https://vercel.com/docs/analytics#how-visitors-are-determined))
- **Anonymized data only** by default — top pages, referrers, and coarse demographics (country, OS, browser, device). ([Web Analytics overview](https://vercel.com/docs/analytics))
- **`@vercel/analytics`** provides the `<Analytics />` component (already mounted in `app/layout.tsx`) and a `track()` function for [custom events](https://vercel.com/docs/analytics/custom-events).
- **`beforeSend`** is a hook on `<Analytics />` that runs **before any event is sent**. It receives the event, and you can **modify it** (e.g. rewrite the URL) or **drop it entirely by returning `null`**. This is our scrubbing chokepoint. ([Redacting sensitive data](https://vercel.com/docs/analytics/redacting-sensitive-data))

### How Vercel Speed Insights works

- **`@vercel/speed-insights`** provides a `<SpeedInsights />` component that reports **Core Web Vitals** (FCP, LCP, etc.) and a **Real Experience Score**, aggregated by route, device, and country. ([Speed Insights overview](https://vercel.com/docs/speed-insights))
- It is sampled real-user monitoring (RUM) and, like Web Analytics, is **cookieless**. It complements — but does **not** replace — our own `time-to-first-graph` custom metric, because RES/LCP measure paint, not "graph is usable."

> ⚠️ **The repo-path leak.** Speed Insights buckets data by **route/path**, and Web Analytics records **page paths** by default. Chronos' graph route is `/repo/[owner]/[repo]`, so the *raw* path contains the repo owner and name. Left untouched, default page-path analytics would record **which repos people view** — a direct violation of §2. **This must be scrubbed** (§4). For Speed Insights, Next.js App Router reports the **route template** (`/repo/[owner]/[repo]`), not the filled-in path, which keeps it safe — but this must be verified in the dashboard during COA-98, not assumed.

---

## 4. Path scrubbing (the critical privacy control)

Default page-view events carry `event.url`. For Chronos that URL can be `https://chronos.app/repo/torvalds/linux`. We rewrite every URL down to its **route template** before it is sent, and drop the query string entirely.

```ts
// app/layout.tsx — the <Analytics /> mount, conceptual
import { Analytics } from "@vercel/analytics/next";
import { scrubUrl } from "@/lib/analytics";

<Analytics beforeSend={(event) => {
  // Returning null drops the event; returning the event (modified) sends it.
  const url = scrubUrl(event.url);          // /repo/torvalds/linux -> /repo/[owner]/[repo]
  if (url === null) return null;            // belt-and-suspenders: drop if unrecognized
  return { ...event, url };
}} />
```

`scrubUrl` lives in `lib/analytics.ts` and maps any incoming pathname to a **known route template** from a fixed allowlist, discarding owner/name segments and **all** query/hash:

```ts
// lib/analytics.ts — scrubbing
const ROUTE_TEMPLATES = [
  "/",                       // home
  "/repo/[owner]/[repo]",    // live graph — owner/repo dropped
  "/demo",                   // synthetic graph
  "/styleguide",             // design system
] as const;

// Map a concrete pathname to its template. Unknown paths -> null (dropped).
export function scrubUrl(rawUrl: string): string | null {
  const { pathname } = new URL(rawUrl);
  if (pathname === "/") return "/";
  if (/^\/repo\/[^/]+\/[^/]+/.test(pathname)) return "/repo/[owner]/[repo]";
  if (pathname.startsWith("/demo")) return "/demo";
  if (pathname.startsWith("/styleguide")) return "/styleguide";
  return null; // fail closed: an unrecognized path is never sent verbatim
}
```

Design choices that matter:

- **Allowlist, not denylist.** We name the routes we *will* report. Anything new fails closed (returns `null`) until someone adds it deliberately — so a future route can never silently leak.
- **Query and hash are always dropped.** Even though Chronos shouldn't put secrets in the query string, we strip it unconditionally (the [Vercel redaction guide](https://vercel.com/docs/analytics/redacting-sensitive-data) shows the per-param approach; we go further and template the whole path).
- **Same control covers Speed Insights.** App Router already reports the route template for RUM, but COA-98 must confirm no concrete `/repo/owner/name` path appears in the Speed Insights dashboard.

---

## 5. The single chokepoint: `lib/analytics.ts`

Every analytics call in the app goes through **one module**. Components never import `@vercel/analytics`'s `track` directly. This gives us one place to (a) enforce the allowlisted event/prop shape, (b) scrub, and (c) flip the kill switch.

```ts
// lib/analytics.ts (shape sketch — not final)
import { track as vercelTrack } from "@vercel/analytics";

const ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "false"; // off-switch, §7

// Allowlisted events. The union IS the spec; nothing off-list compiles.
type AnalyticsEvent =
  | { name: "repo_submitted"; props: { source: "url" | "github" } }
  | { name: "render_result";  props: { ok: boolean; error?: ErrorCode } }
  | { name: "graph_ready";    props: { device: DeviceClass; ms_bucket: MsBucket; size_bucket: SizeBucket } }
  | { name: "lazy_page";      props: { depth: number } }
  | { name: "interaction";    props: { kind: "glance" | "trace" | "inspect" | "peek" } }
  | { name: "theme_change";   props: { theme: "dark" | "light" | "system" } }
  | { name: "demo_view";      props: Record<string, never> }
  | { name: "rate_limited";   props: Record<string, never> };

type ErrorCode = "rate_limit" | "not_found" | "network" | "parse" | "unknown";
type DeviceClass = "phone" | "laptop";
type MsBucket = "lt_500" | "500_1500" | "1500_4000" | "gt_4000";
type SizeBucket = "lt_100" | "100_1k" | "1k_10k" | "gt_10k";

export function track<E extends AnalyticsEvent>(name: E["name"], props: E["props"]): void {
  if (!ENABLED) return;
  // props are already enums/counts/durations by construction; no free-text path exists.
  vercelTrack(name, props as Record<string, string | number | boolean | null>);
}
```

Why this shape:

- **Typed allowlist.** Vercel custom-event values may only be `string | number | boolean | null`, with names/keys/values ≤ 255 chars and no nested objects ([custom-events limitations](https://vercel.com/docs/analytics/custom-events#limitations)). Our union is *stricter* than Vercel allows — there is literally no way to pass a repo name through it, because no event accepts free text.
- **Bucketed, never raw.** Durations and sizes are pre-bucketed to enums before they ever reach `track()`, so a precise value can't fingerprint a repo.
- **One import to audit.** A reviewer (or the privacy pre-flight) reads one file to verify the entire data surface.

---

## 6. Events & metrics catalog

### Funnel / custom events (`track()`, §5)

| Event | Props | Answers |
|---|---|---|
| `repo_submitted` | `source: url \| github` | Which entry point is used; top of funnel |
| `render_result` | `ok: boolean`, `error?: ErrorCode` | Success/failure rate **by error code** |
| `lazy_page` | `depth: number` | Progressive-load depth; do users scroll into history |
| `interaction` | `kind: glance \| trace \| inspect \| peek` | Are progressive-depth affordances discovered |
| `theme_change` | `theme: dark \| light \| system` | Theme preference distribution |
| `demo_view` | — | Demo reach; pair with `repo_submitted` for conversion |
| `rate_limited` | — | GitHub rate-limit incidence (feeds open decision #6) |

### Performance metrics

| Metric | How captured | Why it's the bar |
|---|---|---|
| **Time-to-first-graph** | `graph_ready { device, ms_bucket }` — emitted by `RepoScreen` when the first page with commits paints (measured from request start) | **Headline.** "At a glance" is a latency promise. Bucketed by **device** (phone vs laptop), **not** size: first paint is bounded by the first page, so it isn't size-dependent — the size dimension lives on `layout_cost` where it's meaningful. (Caveat: measures fetch+render from `RepoScreen` mount, not full navigation.) |
| **Layout cost** | `layout_cost { ms_bucket, size_bucket }` — `GraphExplorer` times the synchronous `layoutGraph` pass and emits once per size bucket reached this mount | The layout engine is the highest-risk module (AGENTS §3) and the basis of the "no web worker yet" decision; `size_bucket` flags when a big repo pushes layout past frame budget and a worker becomes necessary |
| **Core Web Vitals / RES** | `@vercel/speed-insights` `<SpeedInsights />`, auto, route-templated | Paint-level RUM that complements (not replaces) time-to-first-graph |
| **Rate-limit incidence** | `rate_limited` event count ÷ `repo_submitted` | Capacity + caching signal |

All buckets are coarse on purpose: they answer "is it fast enough / is it regressing" without ever recording a value precise enough to identify a repo. Both perf events go through the same `track()` chokepoint and typed union as COA-97 — only enums and bucketed counts, never a raw duration, size, or repo identifier.

### Dashboards / queries (feeds COA-74 + the worker decision)

In the Vercel **Web Analytics → Custom Events** view (filterable by event name + prop):

- **Time-to-first-graph:** `graph_ready`, split by `ms_bucket`, segmented by `device`. Watch the share in `1500_4000` / `gt_4000` (phone especially) — that's the "at a glance" promise eroding.
- **Layout cost:** `layout_cost`, `ms_bucket` distribution within each `size_bucket`. Any `100_500` / `gt_500` at `1k_10k`+ is the signal to move `layoutGraph` to a worker (ARCHITECTURE decision #2).
- **Lazy-paging depth:** max `lazy_page.depth` distribution — validates the eager-3-pages default (ADR 006 / COA-74).
- **Rate-limit incidence:** `count(rate_limited) ÷ count(repo_submitted)` — if non-trivial, it sharpens the COA-74 caching / app-token decision.

### Speed Insights route-template check (manual gate)

Speed Insights buckets by route, and Next App Router reports the **template** (`/repo/[owner]/[repo]`), not the filled-in path — so it inherits the no-repo-identity guarantee. **Verify once after deploy** in the Speed Insights dashboard that the routes list shows only `/`, `/repo/[owner]/[repo]`, `/demo`, `/styleguide` — never a concrete `/repo/owner/name`. (Manual, like the Lighthouse installability gate; it can't be asserted from a unit test against a live dashboard.)

---

## 7. Off-switch, consent & disclosure

- **Env off-switch.** `NEXT_PUBLIC_ANALYTICS_ENABLED=false` disables **all** tracking at the chokepoint (§5) and should also gate mounting `<Analytics />` / `<SpeedInsights />`. Self-hosters get an analytics-free build by setting one variable; the open-source README documents this.
- **User opt-out.** Honor the Vercel `va-disable` `localStorage` convention in `beforeSend` (return `null` when set), so a privacy-conscious user can turn tracking off in their own browser. ([opt-out pattern](https://vercel.com/docs/analytics/redacting-sensitive-data#allowing-users-to-opt-out-of-tracking))
- **Consent stance.** Because the data is **cookieless, anonymous, and contains no PII or repo identifiers**, this is the least-intrusive analytics posture available and does not rely on tracking cookies. We still **disclose plainly** in the public-facing [`/PRIVACY.md`](../PRIVACY.md): cookieless analytics, repo names scrubbed, no accounts, no cross-site tracking. If Chronos later adds anything that *does* require consent, that is a **fresh privacy pre-flight**, not an amendment to this doc.
- **No silent expansion.** Adding a new event, a new prop, a new route to the scrub allowlist, or Speed Insights itself is a deliberate, reviewed change to `lib/analytics.ts` / the `<Analytics />` mount — never an incidental one.

---

## 8. Mapping to the backlog

| Ticket | Scope | Status / next action |
|---|---|---|
| **COA-96** | Finish the Web Analytics integration: add `beforeSend` path scrubbing (§4), create the `lib/analytics.ts` chokepoint + allowlist (§5), wire the env off-switch (§7), and **run the privacy pre-flight** for the analytics egress path. | **Immediate next step.** `@vercel/analytics@^2` is installed and `<Analytics />` is already mounted **without** `beforeSend` (`app/layout.tsx`), so today's build would record raw `/repo/owner/name` paths. Scrubbing closes that gap. |
| **COA-97** | Instrument the custom events in §6 (`repo_submitted`, `render_result`, `lazy_page`, `interaction`, `theme_change`, `demo_view`, `rate_limited`) via the chokepoint `track()`. | **Done.** Typed `track()` + `AnalyticsEvent` union live in `lib/analytics.ts`; emitted from the URL form (`repo_submitted`), `RepoScreen` (`render_result` / `rate_limited` / `lazy_page`), `GraphView` + `GraphExplorer` (`interaction`: trace/peek/inspect/glance), `ThemeToggle` (`theme_change`), and `/demo` (`demo_view`). Payload contract is unit-tested in `tests/analytics.test.ts`. |
| **COA-98** | Performance metrics: time-to-first-graph (headline), layout cost, rate-limit incidence; `@vercel/speed-insights` `<SpeedInsights />` and **verify in the dashboard that only route templates appear** (no `/repo/owner/name`). | **Done.** `graph_ready` (RepoScreen) + `layout_cost` (GraphExplorer) emit through `track()` with bucketed ms/size enums; bucket boundaries unit-tested. `<SpeedInsights />` already mounted (COA-96); the route-template check is a documented manual post-deploy gate (above). Queries for all metrics documented above. |

### Pre-flight note

Analytics is a new egress path, so **COA-96 must clear `.claude/skills/privacy-preflight/`** before merge — naming the data (enums/counts/durations only), the destination (Vercel, cookieless), retention (Vercel's anonymized aggregates; daily-rotating hash, no cross-site/cross-day identity), and the consent surface (disclosure in `/PRIVACY.md` + env off-switch + `va-disable` opt-out). Speed Insights in COA-98 is the same destination but a separately-mounted collector, so confirm it inherits the same route-template-only guarantee.

---

## References

- Vercel Web Analytics — <https://vercel.com/docs/analytics>
- How visitors are determined (cookieless) — <https://vercel.com/docs/analytics#how-visitors-are-determined>
- Tracking custom events / `track()` + limitations — <https://vercel.com/docs/analytics/custom-events>
- Redacting sensitive data / `beforeSend` — <https://vercel.com/docs/analytics/redacting-sensitive-data>
- Speed Insights — <https://vercel.com/docs/speed-insights>
- Chronos privacy rules (binding) — [docs/PRIVACY.md](PRIVACY.md)
