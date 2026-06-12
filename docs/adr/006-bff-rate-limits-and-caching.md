# ADR 006 — Rate limits & caching for the BFF proxy

**Status:** Proposed — awaiting owner ratification (COA-74, open decision #6)
**Date:** 2026-06-11
**Binding constraints:** [PRIVACY.md](../PRIVACY.md) — zero durable storage of repo
data, no content/token logging, short-TTL bounded caches only.

## Context

All v1 ingestion flows through the server-side BFF proxy (decisions #3 + #7)
to the official GitHub REST API. That API meters us:

- **Unauthenticated:** 60 requests/hour — and the bucket is **per egress IP**.
  On Vercel, serverless functions share egress IPs, so in production this
  budget is effectively **shared across all users of the deployment**. This is
  the crux: unauthenticated Chronos does not scale past a handful of views per
  hour no matter how frugal each view is.
- **Authenticated:** 5,000 requests/hour per token.

What a view costs today (after lazy paging, merged on this branch): a typical
repo load is ~10 requests (metadata + branches + tags + 3 commit pages + one
page per unmerged branch tip, capped at 10); scrolling deep history adds one
request per 100 commits, up to the 10-page cap. Identical repos viewed by
different users currently cost the full amount every time.

Privacy gives caching a hard boundary: a cache may smooth load, but it must
never become a durable store of repo data, and nothing it holds may exceed
what we already forward to the browser.

## Decision (proposed)

### 1. Server-level GitHub token for proxy calls

Provision a **server-held GitHub credential used only for public, read-only
API calls** — preferably a GitHub App installation token (fine-grained PAT
with public-repo read as the simpler fallback). The BFF attaches it to
upstream requests, raising the budget from 60/hour shared to 5,000/hour.

- The token is **ours, not the user's**; it grants nothing private. No new
  data egress, no new consent surface → does not trigger the privacy
  pre-flight (verified against the skill's checklist; the data, destination,
  and retention are unchanged).
- Stored as a deployment secret; never in the client bundle, never logged
  (PRIVACY baseline). Absent the secret (e.g. local dev), the proxy degrades
  to unauthenticated exactly as today.
- When GitHub OAuth ships (#7), a linked user's own token takes precedence
  for their requests, isolating their budget; the app token remains the
  anonymous pool.

*This is the one item needing owner action: create the token and add it to
the deployment environment.*

### 2. Server-side cache: in-memory, normalized, short-TTL

A small **in-process LRU** in the BFF, keyed by upstream request identity
(`owner/repo` + endpoint + page):

- **What is stored:** only the **post-mapping normalized model** — the same
  graph-relevant fields we already forward to the browser (sha, parents,
  author name, date, message first line, refs). Raw GitHub payloads are
  *not* cached; mapping strips them first, so the cache can never hold more
  than the wire format exposes.
- **Forbidden contents:** tokens, session data, user identifiers, request
  logs, file contents/diffs. A test asserts cached entries hold only the
  allowed fields.
- **TTL: 300 seconds**, uniform. Refs and recent pages go stale in minutes;
  five minutes of staleness is invisible for "understand this repo at a
  glance" and divides upstream load across concurrent/repeat viewers.
- **Bounds: 500 entries / ~25 MB, LRU eviction.** In-memory only — entries
  die with the process (on Vercel, with the function instance). That
  ephemerality is a feature: it structurally cannot become a durable store.
- **Explicitly rejected for v1:** Redis/KV or any external cache store. It
  would raise cross-instance hit rates, but a managed store of repo data —
  however short the TTL — is a materially different privacy posture and
  would need its own pre-flight. Revisit only with evidence the in-process
  cache is insufficient.
- Client-facing responses keep **`Cache-Control: no-store`**; the browser
  cache is not part of this design.

### 3. Client-side: session-scoped state only

The assembled `RepoHistory` lives in React state for the session, and lazy
paging (already merged) keeps spend demand-driven. **No persistent
client-side cache in v1** (no localStorage/IndexedDB of repo data) — reloads
refetch, which the server cache absorbs.

### 4. Rate-limit handling & backoff

- **Server:** on upstream 403/429, map to our `rate-limited` error with
  `retryAfterSeconds` derived from `x-ratelimit-reset` (already implemented).
  When the pool's `x-ratelimit-remaining` drops below **5%**, serve only
  cache hits and answer misses with `rate-limited` + reset time instead of
  burning the last requests — the tail of the budget stays available for
  cheap cached views.
- **Client:** **no automatic retry loops** — they burn budget invisibly.
  Failed initial loads show the designed error state with a retry button and
  the wait time; failed `loadMore` calls re-arm silently so the user's next
  scroll retries (already implemented). Copy states plainly that GitHub's
  limit, not Chronos, is the constraint.
- **No per-user throttling in v1.** A fairness limiter (in-memory per-IP
  counters, no logs) is specced but deferred until abuse is observed —
  it's a knob, and the cognitive-load mandate applies to ops too.

## Consequences

- Anonymous capacity goes from ~3–6 repo views/hour *total* to ~500/hour,
  and repeat/concurrent views of popular repos cost ~0 upstream.
- Staleness is bounded at 5 minutes; a hard refresh within that window may
  show a graph up to 5 minutes old. Acceptable for the product promise.
- Privacy posture is unchanged in kind: repo data still only transits, now
  with a bounded 5-minute in-memory tail, holding strictly the fields the
  browser already receives. PRIVACY.md's caching clause is satisfied as
  written (short-TTL, content-addressed, no added PII, not durable).
- Cold function instances start with an empty cache (Vercel); hit rates are
  best on warm paths and on self-hosted deployments. Accepted v1 trade-off
  per the rejection of external stores.

## Tests required before marking #6 resolved (per COA-74)

1. Cache: TTL expiry, LRU eviction at the entry cap, key correctness
   (owner/repo/page don't collide), and a field-allowlist assertion proving
   no forbidden data is ever stored.
2. Rate-limit simulation: upstream 403-with-remaining-0 → our 429 with
   `retryAfterSeconds`; low-remaining mode serves hits and rejects misses.
3. Token plumbing: requests carry the app token when configured, none
   otherwise; the token never appears in any response or error body.

## On ratification

Move decision #6 from the Open Decisions table into the resolved section of
[ARCHITECTURE.md](../ARCHITECTURE.md), update [PRIVACY.md](../PRIVACY.md)'s
caching clause to reference this ADR's concrete TTL/bounds, and implement
items 1, 2 and 4 (item 3 is already the implemented behavior).
