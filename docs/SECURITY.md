# Security operations

GitHub credentials remain in encrypted httpOnly cookies or server memory. Repo
content is never persisted, cached server-side, or logged. Neither a shared token
nor a missing/failed Chronos login authorizes private repository access. Both repo
endpoints require explicit public visibility or a verified user connection.

## Dependency checks

Run `bun run audit:security`. CI checks both production and development dependencies.
Production advisories always fail. On 2026-10-17 the updated production dependency
tree has no reported advisories.

There is one temporary development exception for
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
`braces@3.0.3`, expiring **2026-11-17**. No patched version is published. The only
dependency path is `eslint-config-next → @next/eslint-plugin-next → fast-glob →
micromatch → braces`. It processes trusted repository lint globs, never HTTP or
GitHub input, and is excluded from production installs. The exception cannot
suppress a production finding. Update or replace that toolchain dependency before
expiry; do not broaden the exception to other packages or advisories.

## Deployment verification

- Restrict the optional `GITHUB_TOKEN` to public, read-only access. The application
  additionally checks visibility and rejects private results through this path.
- GitHub App permissions must be Contents: Read and Metadata: Read, with no write
  permissions. Configure both Setup and Callback URLs to `/api/github/callback`.
- Use different production/development Apps and strong, independent session keys.
  Rotate compromised provider keys and session passwords; never copy them into
  issue descriptions, logs, screenshots, or test fixtures.
- Hosting access logs, drains and tracing must redact repo URLs, query strings,
  cookies and authorization headers. Application code cannot configure the
  operator's Vercel log retention or existing external drains.
- Verify a public anonymous repo, a selected personal private repo and a selected
  organization private repo after deployment. An unselected repo and a repo the
  user cannot access must fail without returning history.

## Telemetry

The Speed Insights SDK is removed. Its URL and DOM attribution fields can reveal private
repo names and commit identifiers even when a route template is also present.
Allowlisted, bucketed graph-performance events continue through Web Analytics with
URL scrubbing. Any replacement real-user monitoring must prove that every outgoing
field excludes repo identity/content before being enabled.
Disable the Speed Insights collector in the Vercel dashboard as well, so older
open pages cannot keep submitting to it. Removing the SDK takes effect only when
the updated code is deployed and loaded.

## Connection lifecycle and operational bounds

Private requests check the active WorkOS user, authoritative installation bindings
and their revocation version, and fresh GitHub user/repo access. Installation tokens
grant read access to one repository. Disconnect rotates the durable version before
reporting success; GitHub grant revocation is attempted independently. A revoked or
old cookie cannot become valid again after reconnect. Chronos never uninstalls an
App on behalf of a user whose repository access does not establish ownership.

GitHub calls have a 12-second deadline, a 5 MiB raw-body limit and at most 32 concurrent
requests per instance. WorkOS metadata calls use a 12-second timeout with automatic
retries disabled. BFF GitHub work shares a 20-second deadline; client requests are
cancellable and bounded at 25 seconds. Only
explicit refresh-token conflicts retry automatically, up to four times with bounded
backoff; 429s and general upstream failures do not.

Per-instance fairness limits allow 120 requests/minute per signed-in user and 60 per
anonymous address (or a shared anonymous pool when a trusted address is unavailable).
Only Vercel's replaced forwarding header is trusted; arbitrary client forwarding
headers never select a new bucket on other hosts. Buckets retain salted hashes and
counts for one minute, cap at 10,000 entries, and are never logged or persisted.
Connection-management requests use a separate 30/minute bucket.
Configure **Vercel Firewall rate limits** for `/api/repo*` and `/api/github/*` before
large-scale exposure: process-local limits cannot enforce a deployment-wide quota.
On 2026-10-18 the project's read-only Firewall API inspection returned no active
or draft custom configuration. A starting rollout policy is 300 repo requests and
60 connection requests per address per minute, initially observed in log mode and
then enforced after checking shared-address traffic. Keep GitHub callbacks usable
and return HTTP 429 for APIs rather than an interactive browser challenge. These
are proposed operator settings, not globally enforced application limits.

Refresh coordination and installation-token reuse are intentionally ephemeral and
instance-local. Cross-instance refresh conflicts recover through bounded browser
retries; persistent provider failure asks for reconnect. A distributed coordinator
would require a separate infrastructure/privacy decision. No Redis/database or
additional provider has been introduced by this change. Repo caching ADR 006 remains
open; none of its proposed repo-content caching is implemented.

The CSP uses a fresh request nonce with strict script execution, forbids framing,
objects and unsafe base URLs, and permits inline styles only for graph geometry.
This requires dynamic HTML rendering. The service worker continues to exclude repo
pages and API responses from its cache.
