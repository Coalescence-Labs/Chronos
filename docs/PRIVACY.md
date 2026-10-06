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

## Ingestion: server-side BFF proxy (decisions #3 + #7, resolved)

> Posture note: an earlier draft resolved #3 as *client-side* (repo data never touches our servers). It was **deliberately revised** when #7 chose the **BFF (Backend-for-Frontend)** OAuth pattern for maximum token security — BFF requires the server to make the GitHub calls, so repo data now transits our infrastructure. This is a conscious trade of "data off our servers" for "token never exposed to browser JS." It is bounded by the rules below; it is **not** a license to retain or mine repo data.

How it works and what this document binds:

- **GitHub App credentials / installation binding rest server-side** — App private key in env; sealed `installationId` (+ account login) in an encrypted, httpOnly, SameSite, Secure `gh-session` cookie — never readable by browser JS, never in the client bundle or logs (Principle 3, 6). The same non-token binding (installation id, account login/type, connected-at, permissions) is also stored in **WorkOS user metadata** so sign-in can rehydrate `gh-session` after sign-out. Short-lived installation access tokens are minted on the server and not stored in the session or metadata.
- **The server proxies GitHub API calls.** Public-repo (and, when connected, private-repo) git metadata flows GitHub → our server → browser **transiently**. **Zero server-side persistence of repo content**, and **no logging of repo content or tokens** (Principle 1, applied as "minimize what *rests*").
- **Fetch the minimum:** only graph-relevant commit fields (sha, parents, author, date, message, refs) — not file contents/diffs unless a specific feature needs them and re-clears pre-flight.
- **Caching** may be both server-side (short-TTL, content-addressed, no PII beyond what GitHub already exposes) and client-side; neither may become a durable store of repo data (see #6).
- **Consent/transparency:** the UI discloses that requests are proxied through our server and that we store neither repo data nor durable tokens beyond the session.
- **Private repos (COA-202):** available only after the user **installs the Chronos GitHub App** on `/account` (WorkOS account required). Permissions are Contents: Read + Metadata: Read (privacy pre-flight below). Without a connection, Chronos remains public-URL / anonymous (or optional shared app-pool token).

Default bias remains: minimize what *rests* on our servers, and never retain or train on repo data.

## Home background snapshot (COA-204)

The owner's requested background is a static asset from Chronos's own public
history. Visitor repo ingestion retains its zero-persistence posture.

### Privacy pre-flight — COA-204 (home background)

1. **What leaves:** node coordinates, merge flags, edge paths, lane indices, and
   canvas dimensions from 80 locally fetched `Coalescence-Labs/Chronos` commits.
   No messages, authors, dates, SHAs, labels, secrets, or visitor data are saved.
2. **Where:** checked into the project and served by Vercel. Capture uses local
   git; no new API, analytics, or third-party request.
3. **Minimum:** bounded geometry from `origin/main` only; capture requires the
   Chronos GitHub origin and excludes local branches and work.
4. **Retention & training:** the asset persists until refreshed or removed;
   no AI provider or training path.
5. **Consent:** the owner requested this public graph; visitors submit no data.
6. **Least privilege:** no new scopes or credentials; logs show only path and count.
7. **Untrusted input:** paths are generated from numeric layout coordinates and
   rendered through React SVG props.

## GitHub repo connection (COA-202)

Account-linked **GitHub App** install for **private repos + authenticated rate limits**. Distinct from WorkOS "Sign in with GitHub" (identity only — see [AUTH.md](AUTH.md)). Owner decision: GitHub App over OAuth App (stricter, truly read-only permissions).

### Privacy pre-flight — COA-202 (GitHub App connect)

1. **What leaves:**
   - **Install consent:** user installs the Chronos GitHub App and selects which repos (or all) the App may access. Chronos receives `installation_id` + account login (for disclosure UI).
   - **While connected, BFF proxy:** same graph-relevant fields as public ingest — sha, parents, author name/login, commit date, commit message, branch/tag refs — for **public or private** repos in the installation. **Not fetched:** file contents, diffs, issues, PRs, Actions, org membership lists beyond what the repo endpoints return.
2. **Where:** GitHub (`github.com` App install UI + `api.github.com`). Chronos BFF receives responses and forwards the normalized model to the browser. Install binding lives in (a) Chronos `gh-session` cookie (iron-session), **separate from** WorkOS `wos-session`, and (b) **WorkOS user metadata** (`chronosGh*` keys — installation id, account login/type, connected-at, permissions; no tokens). Short-lived installation access tokens (~1h) are minted server-side with the App JWT and discarded after the request.
3. **Minimum:** GitHub App permissions **Contents: Read** + **Metadata: Read** only. No write. No durable Chronos DB of repos, installation tokens, or repo content. Cookie max-age 7 days; metadata persists until **Disconnect** (not sign-out).
4. **Retention & training:** GitHub retains App installations per their policies. Chronos holds install binding in httpOnly `gh-session` and WorkOS metadata (no repo content). Not an AI path — no ZDR question. **Sign-out** clears `wos-session` + `gh-session` but **keeps** WorkOS metadata and does **not** uninstall the App. **Disconnect** clears metadata + `gh-session` and best-effort uninstalls the App installation.
5. **Consent:** explicit **Install GitHub App** on `/account` with disclosure of permissions, proxying, session storage, disconnect, and manual uninstall guidance — all visible before install (never collapsed); once connected they fold behind "Access and privacy". Public paste needs no GitHub connect.
6. **Least privilege:** truly read-only App permissions; never request Contents: Write, Administration, or other write-oriented grants.
7. **Secrets:** `GITHUB_APP_PRIVATE_KEY`, `GITHUB_SESSION_PASSWORD`, App JWTs, and installation access tokens are server-only — never in client bundle, `/api/github/status`, `/api/auth/me`, logs, or error bodies. Installation id is not exposed in public status JSON.
8. **Untrusted input:** private commit messages / branch names remain untrusted — sanitize before render (existing ingest posture).

## User accounts: WorkOS AuthKit (COA-200)

Optional Chronos accounts are authenticated by **WorkOS AuthKit**. Public paste
and `/demo` remain usable with **no account**. Engineering notes:
[AUTH.md](AUTH.md).

### Privacy pre-flight — COA-200 (accounts)

1. **What leaves:** identity needed to authenticate — email, name (if provided),
   profile picture URL (if provided), and auth-provider subject metadata for the
   chosen method (email/password, GitHub social, Google social). MFA/passkey
   enrollment metadata is held by WorkOS. **Not sent:** repo content, commit
   messages, SHAs, branch names, or any GitHub *repo* OAuth token (that path is
   separate — COA-79 / COA-202).
2. **Where:** WorkOS AuthKit / User Management (`api.workos.com` and the hosted
   AuthKit UI). Chronos receives the auth callback and seals the session locally.
3. **Minimum:** only identity fields required to establish and display a signed-
   in session (`/api/auth/me` is an allowlisted public user shape — no tokens).
4. **Retention & training:** WorkOS retains account records as the IdP under
   their DPA/ToS (operator must keep a current WorkOS agreement on file). Chronos
   holds **no durable user database** in this slice — only an **encrypted
   httpOnly, SameSite, Secure** session cookie (iron-session seal; recommended
   max-age 7 days via `WORKOS_COOKIE_MAX_AGE`) plus optional **GitHub App install
   binding** in WorkOS user metadata (COA-202 — see above; not repo content).
   Access/refresh tokens never reach browser JS or logs. Not an AI path — no ZDR
   question for WorkOS auth.
5. **Consent:** creating an account or signing in is the consent surface. The
   `/account` page discloses the cookie posture. Anonymous viewing needs no
   consent beyond the existing BFF proxy disclosure.
6. **Least privilege:** WorkOS GitHub/Google connections are **login identity
   only**. They are distinct from GitHub App repo connect (decision #7 / COA-202).
   Chronos still never requests write permissions for repo access.
7. **Secrets:** `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` are server-only;
   never in the client bundle. Session secrets stay in the httpOnly cookie.
8. **Untrusted input:** AuthKit-hosted UI handles credential capture; Chronos
   renders allowlisted identity fields only.

## Analytics (Vercel Web Analytics + Speed Insights)

Cookieless, anonymous, first-party product analytics (no third party, no cross-day/cross-site identifier). The full design + event catalog is in [ANALYTICS.md](ANALYTICS.md). The binding rules:

- **No repo identity, ever.** Page-view URLs are scrubbed to their **route template** before anything is sent — `/repo/[owner]/[repo]`, never the filled-in owner/name — by a `beforeSend` hook over a fixed route **allowlist** (`lib/analytics.ts` `scrubUrl`). Unrecognized paths are **dropped** (fail closed). Query strings and hashes are always discarded.
- **No PII, no repo content.** We collect only anonymous aggregates (coarse geo/device from Vercel) plus, in future, a typed allowlist of enums/counts/durations (COA-97/98) — never commit messages, SHAs, branch/tag names, authors, tokens, or free text. Sizes are bucketed.
- **One chokepoint.** All analytics flow through `lib/analytics.ts`; components never call the Vercel SDK directly, so the data surface is auditable in one file.
- **Off switch.** `NEXT_PUBLIC_ANALYTICS_ENABLED=false` disables analytics entirely (for self-hosting / opt-out).

### Privacy pre-flight — COA-96 (analytics)
1. **What leaves:** anonymous page-view events (templated path, referrer, coarse geo/device; cookieless daily hash) → Vercel. No repo identifiers (scrubbed) and no repo content.
2. **Where:** Vercel Web Analytics + Speed Insights (`/_vercel/insights`, `/_vercel/speed-insights`).
3. **Minimum:** path templated to the route, query/hash dropped, allowlist fail-closed; this is the smallest payload that still answers the product questions.
4. **Retention/training:** product analytics, not an AI path — no ZDR question; cookieless, aggregated, no training.
5. **Consent:** cookieless/anonymous (no consent banner needed); disclosed in the public [PRIVACY.md](../PRIVACY.md). Opt-out via the env switch.

## Search indexing & link previews (COA-126)

The repo view's URL contains the repo identity (`/repo/[owner]/[repo]`), so search/social must not expose *which repo someone viewed* — the same promise `scrubUrl` keeps for analytics:

- **`/repo/*` is `noindex, nofollow`**, **disallowed in `robots.txt`**, and **excluded from `sitemap.xml`**. This keeps repo identity out of search indexes, and — because a crawler hitting `/repo/*` would trigger live BFF→GitHub calls — also protects the rate-limit budget (#caching / COA-74).
- **Open Graph / Twitter cards are generic** (the branded app card). The `/repo/*` route sets no per-repo OG/title for sharing, so a pasted link never reveals the owner/repo in a preview. The `owner/repo` only appears in the visitor's own browser tab title.
- Only the static marketing surface (`/`, `/demo`) is indexable.

## The native companion as a privacy feature

The phase-2 `zero-native` desktop app exists largely *for* privacy: it reads the local `.git` directly, so for local repos **nothing is uploaded at all**. When weighing features, remember this is the gold-standard mode and the web app should not regress the privacy story for users who could use local mode.

## Security hygiene (baseline)

- Treat any rendered repo content as untrusted input (commit messages, branch names, author fields) — sanitize before render to prevent injection.
- In the native companion, the WebView is untrusted by `zero-native`'s model; native capabilities are opt-in and permission-scoped. Preserve that posture — don't widen native permissions for convenience.
- Secrets and tokens never go in the client bundle or logs.
