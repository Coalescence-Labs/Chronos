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

Speed Insights is disabled. Its URL and DOM attribution fields can reveal private
repo names and commit identifiers even when a route template is also present.
Allowlisted, bucketed graph-performance events continue through Web Analytics with
URL scrubbing. Any replacement real-user monitoring must prove that every outgoing
field excludes repo identity/content before being enabled.
