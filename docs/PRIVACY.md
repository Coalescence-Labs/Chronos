# Privacy & Security — Chronos

> Privacy is a **product promise**, not a feature flag. Viewing a repo must never quietly cost the user their data. This document is binding; when it conflicts with convenience, privacy wins.

## Principles

1. **Minimize what touches our servers.** The less repo/user data that transits or rests on our infrastructure, the smaller the promise we have to keep. Prefer architectures that keep data on the user's device.
2. **Opt-in, not opt-out.** Anything beyond rendering the graph — especially AI — is off until the user turns it on, with a clear statement of what it sends where.
3. **Least privilege.** GitHub OAuth requests the **minimum scopes** needed. Store the minimum token data for the minimum time. Never request write scopes — Chronos only reads.
4. **No silent egress.** Every path that sends data off-device or off-server is documented and intentional. New egress paths require the privacy pre-flight (below).
5. **Transparency.** Because Chronos is open source, the privacy claims are auditable. Keep them honest.

## AI: Zero Data Retention (ZDR) — long-term rule; beta carve-out

**Long-term:** AI features are **opt-in** and may only use a provider that contractually guarantees **Zero Data Retention** — no storage of prompts/outputs beyond the request, and **no training** on user data. Written ZDR is still an open architecture decision (#5); see [AI.md](AI.md).

**Hard rules (always):**
- Send the **minimum** necessary context to answer the user's request — never the whole repo "just in case."
- Make it explicit in the UI what is sent off-device when an AI feature is used.
- AI is gated behind the **privacy pre-flight skill** — see below.
- **Private-repo Agent** and any expansion beyond the beta carve-out require **written ZDR** before shipping.

**Beta carve-out (owner-ratified):** Graph Q&A may run on **public repositories only** via Vercel AI Gateway **before** written ZDR is on file. This does **not** authorize private-repo Agent, whole-repo dumps, or silent retention. Ending the carve-out or widening scope needs a new pre-flight and owner ratification. Infra detail: [AI.md](AI.md).

## The privacy pre-flight (mandatory)

Before merging **any** AI feature or **any** new path that sends user/repo data off the user's device or off our server, run the guardrail at `.claude/skills/privacy-preflight/`. It is a short checklist that forces you to name the data, the destination, the retention terms, and the user's consent surface. No exceptions — the owner emphasized privacy as a core pillar.

## Ingestion: server-side BFF proxy (decisions #3 + #7, resolved)

> Posture note: an earlier draft resolved #3 as *client-side* (repo data never touches our servers). It was **deliberately revised** when #7 chose the **BFF (Backend-for-Frontend)** OAuth pattern for maximum token security — BFF requires the server to make the GitHub calls, so repo data now transits our infrastructure. This is a conscious trade of "data off our servers" for "token never exposed to browser JS." It is bounded by the rules below; it is **not** a license to retain or mine repo data.

How it works and what this document binds:

- **GitHub App credentials / installation binding rest server-side** — App private key in env; sealed credentials and bindings in an encrypted, httpOnly, SameSite, Secure `gh-session` cookie — never readable by browser JS, never in the client bundle or logs (Principle 3, 6). Non-token bindings and a non-secret revocation version also live in **WorkOS user metadata**, allowing reconnect without reinstalling. Installation tokens are restricted to one repo and read permissions, held only in bounded process memory until before expiry, never in the session or metadata. A bounded 60-second process-memory grace window coordinates user-token rotation. No credentials enter an external cache or database.
- **The server proxies GitHub API calls.** Public-repo (and, when connected, private-repo) git metadata flows GitHub → our server → browser **transiently**. **Zero server-side persistence of repo content**, and **no logging of repo content or tokens** (Principle 1, applied as "minimize what *rests*").
- **Fetch the minimum:** only graph-relevant commit fields (sha, parents, author, date, message, refs) — not file contents/diffs unless a specific feature needs them and re-clears pre-flight.
- **Caching** may be both server-side (short-TTL, content-addressed, no PII beyond what GitHub already exposes) and client-side; neither may become a durable store of repo data (see #6).
- **Consent/transparency:** the UI discloses that requests are proxied through our server and that we store neither repo data nor durable tokens beyond the session.
- **Private repos (COA-202):** available only after the user **installs the Chronos GitHub App** on `/account` (WorkOS account required). Permissions are Contents: Read + Metadata: Read (privacy pre-flight below). Without a connection, Chronos remains public-URL / anonymous (or optional shared app-pool token).

Default bias remains: minimize what *rests* on our servers, and never retain or train on repo data.

## Route preparation and browser-local Glance

The owner approved intent-based route preparation and a browser-local Glance
worker on 2026-10-13. The existing home disclosure now explains that entering
an address can prepare a page before submission; history is fetched afterwards.

### Privacy pre-flight — approved performance batch

1. **What leaves:** validated `owner` and `repo` in the existing
   `/repo/[owner]/[repo]` route request when a valid address is pasted or
   Visualize receives keyboard focus or sustained hover. Input queries,
   fragments and unrelated URL fields are stripped by `parseRepoInput`.
   No history, commits or refs are fetched by route prefetch. Glance passes
   normalized commit fields (sha, parents, author, date, message) and refs
   (name, type, sha) to a worker **inside the same browser**, not to a server.
2. **Where:** route/code preparation goes to Chronos's existing origin; the
   worker's code is a same-origin static asset. The worker performs no fetch,
   analytics, AI or third-party call with repo data.
3. **Minimum:** one validated route per intent, deduplicated for 30 seconds;
   hover is delayed 150ms and cancelled on submit, pointer leave/down, input
   changes or unmount. Home hydration prepares demo and repo-view code without
   sending a visitor's repo identity. History ingestion still begins only on
   navigation.
4. **Retention & training:** existing Chronos zero-persistence/no-content-log
   policy applies. Next's route cache and one computed Glance snapshot are
   in tab memory; no durable repo cache, extra telemetry or AI/training path.
   The worker and its derived snapshot are released when the explorer unmounts.
5. **Consent:** deliberate address entry plus paste/focus/hover intent; the
   home proxy disclosure is visible before submission and names the earlier
   address request. Warming does not submit or display a repository.
6. **Least privilege:** no new scopes, credentials or installation permissions.
   Sign-in/connect/disconnect actions are never prefetched. Existing httpOnly
   session refresh may accompany same-origin route requests; the auth/session
   data flow remains the one documented under COA-200.
7. **Secrets:** worker messages contain no tokens or session data; no new
   repo-content, identifier or error-content logging.
8. **Untrusted input:** existing input validation constructs the route; React
   renders repo text as text. Commit messages and refs never become executable
   worker source or request destinations.

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
   - **User verification:** GitHub App authorization code, PKCE verifier, client ID/secret and callback URI go to GitHub's token endpoint; refresh token on renewal. `offline_access` forces token expiration without adding repo permissions. `GET /user/installations` verifies saved installations; `GET /repos/{owner}/{repo}` with the user token checks access on every BFF request before an installation token is minted or reused. Disconnect sends the user token and App client credentials to GitHub's grant-revocation endpoint when available.
   - **While connected, BFF proxy:** same graph-relevant fields as public ingest — sha, parents, author name/login, commit date, commit message, branch/tag refs — for **public or private** repos the user and installation can both read. **Not fetched:** file contents, diffs, issues, PRs, Actions or org membership lists.
2. **Where:** Existing GitHub install/authorization UI, token endpoint and API; no new provider. Bindings live in encrypted `gh-session` and WorkOS metadata (`chronosGhInstall_<id>` plus `chronosGhVersion`), separate from WorkOS `wos-session`. User credentials stay in the sealed cookie and bounded, ephemeral server refresh coordination, never WorkOS. Repo-scoped installation tokens stay in process memory for at most 55 minutes and expire before GitHub's token expiry. There is no durable credential cache or repo-content cache.
3. **Minimum:** GitHub App permissions **Contents: Read** + **Metadata: Read** only. No write. No durable Chronos DB of repos, installation tokens, or repo content. Cookie max-age 7 days; metadata persists until **Disconnect** (not sign-out).

Each binding includes `installationId`, account login/type, connected-at date and
read-permission summary. Disconnect clears metadata bindings while retaining the
non-secret revocation version described below.
4. **Retention & training:** Existing GitHub/WorkOS terms apply; no AI path or added content retention. **Sign-out** clears both cookies and **keeps** install metadata, requiring user verification on reconnect. **Disconnect** clears bindings and the cookie, rotates a non-secret revocation marker and attempts GitHub user-grant revocation. The marker remains to reject older sessions. No App installation is uninstalled: owner-authorized removal stays in GitHub. In-memory refresh coordination lasts at most 60 seconds; repo-scoped installation tokens expire within 55 minutes or sooner. All process-memory state dies with the instance.
5. **Consent:** explicit **Install GitHub App**, **Reconnect GitHub**, or **Add organization** on `/account`, followed by GitHub's install and user-authorization screens. Read-only permissions and encrypted credential storage are disclosed before install; once connected the facts fold behind "Access and privacy". Organization approval requests are shown as pending. Public paste needs no GitHub connect.
6. **Least privilege:** truly read-only App permissions; never request Contents: Write, Administration, or other write-oriented grants.
7. **Secrets:** `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_SESSION_PASSWORD`, App JWTs, user access/refresh tokens, and installation access tokens are server-only — never in client bundle, `/api/github/status`, `/api/auth/me`, logs, or error bodies. Installation ids are not exposed in public status JSON. Tokens are never saved in WorkOS metadata.
8. **Untrusted input:** private commit messages / branch names remain untrusted — sanitize before render (existing ingest posture).

### Request abuse protection

Request counters retain only a per-process salted hash of the active user ID or
trusted client address, a count and a one-minute expiry (at most 10,000 entries).
They never leave the process, enter logs or persist. No repo identity/content is
part of a counter key. Other hosts ignore client-supplied forwarding headers and
use a shared anonymous bucket. Deployment-wide limits belong in the hosting
firewall; no new external data service is introduced.

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

## Analytics (Vercel Web Analytics)

**Security update (2026-10-17): Speed Insights is disabled.** Its independent URL
and DOM-attribution fields can disclose repo names and commit SHAs. Route templating
does not redact those fields. Web Analytics continues with allowlisted URL scrubbing
and bucketed performance events. No new telemetry destination or field is added.

Cookieless, anonymous, first-party product analytics (no third party, no cross-day/cross-site identifier). The full design + event catalog is in [ANALYTICS.md](ANALYTICS.md). The binding rules:

- **No repo identity, ever.** Page-view URLs are scrubbed to their **route template** before anything is sent — `/repo/[owner]/[repo]`, never the filled-in owner/name — by a `beforeSend` hook over a fixed route **allowlist** (`lib/analytics.ts` `scrubUrl`). Unrecognized paths are **dropped** (fail closed). Query strings and hashes are always discarded.
- **No PII, no repo content.** We collect only anonymous aggregates (coarse geo/device from Vercel) plus, in future, a typed allowlist of enums/counts/durations (COA-97/98) — never commit messages, SHAs, branch/tag names, authors, tokens, or free text. Sizes are bucketed.
- **One chokepoint.** All analytics flow through `lib/analytics.ts`; components never call the Vercel SDK directly, so the data surface is auditable in one file.
- **Off switch.** `NEXT_PUBLIC_ANALYTICS_ENABLED=false` disables analytics entirely (for self-hosting / opt-out).

### Privacy pre-flight — COA-96 (analytics)
1. **What leaves:** anonymous page-view events (templated path, referrer, coarse geo/device; cookieless daily hash) → Vercel. No repo identifiers (scrubbed) and no repo content.
2. **Where:** Vercel Web Analytics (`/_vercel/insights`). Speed Insights is removed.
3. **Minimum:** path templated to the route, query/hash dropped, allowlist fail-closed; this is the smallest payload that still answers the product questions.
4. **Retention/training:** product analytics, not an AI path — no ZDR question; cookieless, aggregated, no training.
5. **Consent:** cookieless/anonymous (no consent banner needed); disclosed in the public [PRIVACY.md](../PRIVACY.md). Opt-out via the env switch.

## Chronos Agent (Graph Q&A — beta)

Opt-in graph Q&amp;A from history already loaded in the browser. Canonical infra map:
[AI.md](AI.md). Live model calls require Account opt-in (`chronosAgentOptIn`), Upstash
spend controls ($5/user/mo under `chronos:` Redis keys), and Vercel AI Gateway
(Claude Sonnet 5.5 answers + Haiku 5.5 Jev). `CHRONOS_AGENT_KILL_SWITCH` disables
Agent without redeploying UI. **Public repos only** until written ZDR (open #5).

### Privacy pre-flight — Agent (beta)

1. **What leaves (when live):** the user's natural-language question; graph-anchored
   facts derived from loaded commits/refs (sha, parents, dates, first-line messages,
   branch/tag names — **author names omitted**); optional selected commit sha; PR
   titles/labels only when GitHub connect grants access and the user asks a PR-capable
   question. **Empty-chat starters (Haiku):** compact fact-tool slice (repo name,
   default branch, ref names, short tip SHAs, truncated merge first-lines) — same
   author-omitted class as Graph Q&A facts; no file contents. **Not sent:** file
   contents, diffs, whole-repo dumps, tokens, or Exa/web search. **Scope:** public
   repositories for beta (Account disclosure).
2. **Where:** Vercel AI Gateway → Sonnet 5.5 / Haiku 5.5 (env-overridable Gateway
   slugs). Jev sends **only the question text** for allow/flag classification before
   orchestration. Starter generation uses Haiku with a hard **~$0.05** input budget
   (fail closed). Spend ledger, rate limits, and starter cache use Upstash keys
   prefixed `chronos:` (spend = counts/usd; starter cache = `{id,label,prompt}` only —
   no raw repo facts). Shared Organic Redis is OK under that prefix only. Browser
   `localStorage` may hold the same chip labels/prompts for the current UTC day
   (keyed by repo + history fingerprint hash) — **on-device only**, no secrets/SHAs.
3. **Minimum:** fact tools answer from in-memory graph; model sees compact fact bundles,
   not raw GitHub payloads. Starters reuse that minimum slice and cache only chip copy.
4. **Retention & training:** Written ZDR remains **open (#5)**. Beta carve-out allows
   public-repo Graph Q&A without written ZDR; Redis ledger holds monthly spend totals
   only. Private-repo Agent waits on written ZDR + a fresh pre-flight.
5. **Consent:** Account toggle + in-product disclosure before first send; public paste
   works without Agent.
6. **Least privilege:** no new GitHub scopes for Agent; PR tools reuse existing read
   permissions when connected.
7. **Secrets:** `AI_GATEWAY_API_KEY` server-only; never in client bundles or logs.
8. **Untrusted input:** model output passes through `renderSafeAgentMarkdown` before
   HTML render; questions treated as untrusted in prompts.

## Search indexing & link previews (COA-126)

The repo view's URL contains the repo identity (`/repo/[owner]/[repo]`), so search/social must not expose *which repo someone viewed* — the same promise `scrubUrl` keeps for analytics:

- **`/repo/*` is `noindex, nofollow`**, **disallowed in `robots.txt`**, and **excluded from `sitemap.xml`**. This keeps repo identity out of search indexes, and — because a crawler hitting `/repo/*` would trigger live BFF→GitHub calls — also protects the rate-limit budget (#caching / COA-74).
- **Open Graph / Twitter cards are generic** (the branded app card). The `/repo/*` route sets no per-repo OG/title for sharing, so a pasted link never reveals the owner/repo in a preview. The `owner/repo` only appears in the visitor's own browser tab title.
- Only the static marketing surface (`/`, `/demo`) is indexable.

## Local git for agents (MCP)

`/api/mcp` lets the owner's Organic coding subagent run allowlisted, read-only git commands
against the owner's own local checkouts. It exists only when `CHRONOS_MCP_TOKEN` (≥32 chars)
and `CHRONOS_MCP_REPOS` are set, so the hosted app serves a 404. It is a proposed, reversible
choice: see [ARCHITECTURE.md](ARCHITECTURE.md) open decision #9.

### Privacy pre-flight — local git MCP

1. **What leaves:** the stdout/stderr of each requested git command (capped at 64,000
   characters per stream), the repository's configured name, HEAD's SHA and branch, and the
   exit code. By default only history and working-tree metadata commands are allowed (status,
   log, rev-list, branch, tag, refs, describe, shortlog, ls-files, worktree list): commit
   SHAs, messages, authors, refs and file names, with no file contents or diffs. `show`, `diff`,
   `blame` and `grep` print file contents and are refused unless
   `CHRONOS_MCP_ALLOW_CONTENT=true`.
2. **Where:** the Organic server that holds the bearer token, then the model provider Organic
   uses for that agent turn. Organic adds the output to the subagent's thread.
3. **Minimum:** one command per call. The allowlist is exact flags only, so the agent asks for
   a narrow view (`-20`, `--since=`, paths) rather than whole histories. Chronos keeps nothing
   and logs nothing; responses are `no-store`.
4. **Retention & training — open, owner's call:** Chronos has no AI here, but output reaches a
   model through Organic. Zero data retention follows Organic's per-turn ZDR setting and
   is not enforced by this endpoint. Organic also persists subagent thread messages. Owner
   repositories only; do not enable content commands for repositories you would not paste into
   that chat.
5. **Consent:** off by default. Only the owner can switch it on, by setting the token and
   naming each repository; the matching Organic env restricts use to one Organic profile.
6. **Least privilege:** no GitHub scopes or credentials. Writes, `-c` overrides, external diff
   and text-conversion tools, hooks, fsmonitor and pagers are disabled. `branch` and `tag`
   always run in list mode. The command runs with no shell and a 10-second timeout.
7. **Secrets:** the child process gets only `PATH`, `HOME` and fixed git settings, so app
   secrets (`GITHUB_APP_PRIVATE_KEY`, WorkOS keys) never reach a repo-configured filter. The
   token is compared in constant time and never echoed.
8. **Untrusted input:** arguments are argv tokens. Positionals cannot start with `-`, be
   absolute, or climb with `..`, so `git diff` cannot fall back to reading files outside the
   repository. Server instructions tell the caller that output is data, never instructions.

## The native companion as a privacy feature

The phase-2 `zero-native` desktop app exists largely *for* privacy: it reads the local `.git` directly, so for local repos **nothing is uploaded at all**. When weighing features, remember this is the gold-standard mode and the web app should not regress the privacy story for users who could use local mode.

## Security hygiene (baseline)

- Treat any rendered repo content as untrusted input (commit messages, branch names, author fields) — sanitize before render to prevent injection.
- In the native companion, the WebView is untrusted by `zero-native`'s model; native capabilities are opt-in and permission-scoped. Preserve that posture — don't widen native permissions for convenience.
- Secrets and tokens never go in the client bundle or logs.
