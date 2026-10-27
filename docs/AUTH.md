# Auth — WorkOS AuthKit (COA-200)

> Binding privacy rules live in [PRIVACY.md](PRIVACY.md). This doc is the
> engineering + investigation notes for user accounts.

## Shape

Chronos uses **WorkOS AuthKit** (`@workos-inc/authkit-nextjs`) for optional
user accounts. Authentication is **not required** for public-URL paste or
`/demo`.

```
Browser ──► /sign-in?returnTo=/path ──► WorkOS AuthKit hosted UI
                ▲                              │
                │                              ▼
           /callback ◄── code exchange + sealed session cookie
                │
                ▼
     redirect to returnTo (fallback `/`)
     encrypted httpOnly cookie (wos-session)
     tokens never exposed to browser JS
```

Routes:

| Path | Role |
|------|------|
| `/sign-in` | WorkOS dashboard **Sign-in endpoint** (`initiate_login_uri`); honors `?returnTo=` |
| `/sign-up` | AuthKit sign-up screen hint; honors `?returnTo=` |
| `/callback` | `handleAuth()` — code → sealed cookie; lands on `returnTo` from state, else `/` |
| `/api/auth/sign-in` | Alias of `/sign-in` |
| `/api/auth/sign-up` | Alias of `/sign-up` |
| `/api/auth/sign-out` | **POST only** — clears session (prefer `signOutAction`) |
| `/api/auth/me` | Public session JSON (no tokens) |
| `/account` | Minimal smoke UI (explicit destination only) |

Sign-out must never be a GET route (prefetch / CSRF). Use the server action
`signOutAction` from `lib/auth/actions.ts`.

### Post-login return path

Header **Sign in** passes the current pathname as `?returnTo=`. AuthKit seals
that into PKCE state; `/callback` prefers state over `handleAuth`'s default
(`returnPathname: "/"`). Fallback is **home (`/`)**, not `/account`.

### Post-logout return path

AuthKit's `signOut()` clears the sealed cookie **then** redirects the browser to
WorkOS hosted logout (`/user_management/sessions/logout?session_id=&return_to=`).
If the dashboard **Logout redirect URI** is missing or does not **exactly** match
`return_to`, WorkOS sends the user to **error.workos.com** ("Couldn't sign in")
even though Chronos is already signed out.

**Chronos therefore uses local sign-out** (`chronosSignOut` / `signOutAction`):
clear `wos-session` (+ PKCE cookies) and redirect using the **request Host**
(`sameOriginReturnUrl`) so localhost stays on `http://localhost:3005/`. The
client also hard-navigates to `window.location.origin/` after sign-out.

Do **not** rely on `NEXT_PUBLIC_SITE_URL` / `SITE_URL` for logout destinations —
that constant defaults to the production host and is SEO-only. Logout never
reads it. (Callback URI env is unrelated; keep your local callback as-is.)

Optional dashboard Logout URIs (only needed if you switch back to AuthKit
hosted logout):

| Environment | Logout redirect URI (exact) |
|-------------|-----------------------------|
| Local       | `http://localhost:3005/`    |
| Production  | `https://chronos.coalescencelabs.app/` (or your `NEXT_PUBLIC_SITE_URL` + `/`) |

Also add the same origin without a trailing slash if the dashboard UI stores it
that way — WorkOS matching is strict.

## Cookie posture (decision #7)

AuthKit seals access + refresh tokens into an **encrypted, httpOnly,
SameSite=Lax** cookie (`WORKOS_COOKIE_NAME`, default `wos-session`). Secure
is set when the redirect URI is `https:` (or always in production for non-
localhost). Chronos sets `WORKOS_COOKIE_MAX_AGE=604800` (7 days) in
`.env.example` — shorter than AuthKit's 400-day default.

`eagerAuth` stays **off** so no JWT is mirrored into a separate client-readable
cookie.

## Optional auth / no-env posture

`proxy.ts` must **not** invoke AuthKit when WorkOS is unconfigured.
`authkitProxy` throws (`You must provide a redirect URI…`) if
`NEXT_PUBLIC_WORKOS_REDIRECT_URI` is empty — even with `eagerAuth: false`.
Chronos gates with `isAuthConfigured()` and falls through to
`NextResponse.next()` so anonymous paste/`/demo` work with zero WorkOS env.

Redirect URI env name AuthKit actually reads:
**`NEXT_PUBLIC_WORKOS_REDIRECT_URI`** (not `WORKOS_REDIRECT_URI`).

## GitHub login vs GitHub repo connection

| Concern | Mechanism | Issue |
|---------|-----------|-------|
| **Sign in with GitHub** (identity) | WorkOS social connection — profile/email for the Chronos account | COA-200 |
| **Connect GitHub for repos** (API access, rate limits, private repos) | Chronos **GitHub App** install + BFF `gh-session` (decision #7) | COA-202 (public picker UI still COA-79) |

These must not be conflated. WorkOS GitHub login does **not** grant Chronos a
GitHub API token for ingestion. App install remains a distinct consent +
privacy surface.

**Reversible choice (owner-ratified for this PR):** user installs the Chronos
GitHub App; Chronos seals `installationId` (+ account login) in encrypted
httpOnly `gh-session`; BFF mints short-lived installation access tokens with
the App private key. GitHub App user authorization verifies the installation
and checks the user's access before an installation token is used. This does
not use a separate OAuth App or broader OAuth scopes.


## GitHub App connect (COA-202)

After WorkOS sign-in, `/account` offers **Install GitHub App**. Flow:

```
Browser ──► /api/github/connect ──► GitHub App install UI
                ▲                         │
                │                         ▼
     /api/github/callback ◄── installation_id + state
                │
                ▼
     GitHub App user authorization ──► /api/github/callback?code=…&state=…
                │                      (verify user can access installation)
                │
                ▼
     seal installationId in gh-session (iron-session)
     persist binding in WorkOS user metadata (chronosGh* keys)
     redirect /account?github=connected
```

| Path | Role |
|------|------|
| `/api/github/connect` | Start App install (requires WorkOS user) |
| `/api/github/callback` | Setup + authorization callback; validates user and installation; never returns tokens |
| `/api/github/disconnect` | **POST only** — clears all connections; preserves organization installations |
| `/api/github/status` | Public `{ connected, login, permissions, connectedAt, configured, accounts? }` |

BFF `/api/repo*` selects the installation whose account login matches the repo
owner (case-insensitive). Before minting an installation token it checks
`GET /repos/{owner}/{repo}` with the GitHub **user** access token. Installation
access can exceed an organization member's access, so checking only the
installation would expose private repos. GitHub user tokens are refreshed
server-side when needed and sealed only in `gh-session`; never in WorkOS
metadata or public JSON. Missing user authorization never permits an
installation-token mint. Unconnected owners use the optional public app pool
or anonymous access.

### Personal and organization connections

GitHub App installations are per account/organization. Personal private-repo
access does not grant access to organization repos. Use **Add organization** on
`/account`, choose the organization in GitHub, and select its repos. Organization
policy may require an owner's approval; a pending request is not a connection.
After approval, repeat connect. The callback preserves existing installations
and their original connection dates. Both repo entry and commit pagination
select the matching installation automatically; no connection switcher is needed.

Connect state is encrypted, expires after ten minutes, and binds both callback
stages to the current WorkOS user. A returned installation id is checked against
the GitHub user's paginated `GET /user/installations` response before saving.
The authorization stage uses S256 PKCE and requests `offline_access` to ensure
expiring user credentials without adding repository permissions. Saved installation
access is also checked before replacing the credential shared by those connections.
See [GitHub's setup URL guidance](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url).

Disconnect removes the user's Chronos bindings, rotates a durable authorization
version and clears the local cookie even on failure. It also revokes the GitHub
user grant when credentials are available. No installation is uninstalled:
installation access does not prove ownership, and other people may rely on it.
Installation removal stays in GitHub's owner-authorized settings. Provider failures
are reported honestly; a local cookie clear alone is never reported as full success.

### Durable install binding (WorkOS metadata — owner-ratified)

GitHub App connect stores a **non-token** binding in WorkOS user metadata so
users can reconnect after sign-out without reinstalling:

| Key | Value |
|-----|--------|
| `chronosGhInstall_<installationId>` | JSON tuple `[accountLogin, accountType, connectedAt, permissions, authorizationVersion]` |
| `chronosGhVersion` | Non-secret revocation version; rotated on disconnect |

The original five keys (`chronosGhInstallationId`, `chronosGhAccountLogin`,
`chronosGhAccountType`, `chronosGhConnectedAt`, `chronosGhPermissions`) remain
readable and migrate on the next write. Four-field tuples use the initial version.
Writes patch only supplied installations and legacy keys, preserving simultaneous
additions and unrelated metadata. Read errors propagate; an outage is never treated
as an empty account. Each installation uses one key, with one slot reserved for
revocation, so at most nine installations fit (fewer with unrelated metadata).
Exceeding capacity fails without dropping existing bindings.
This per-installation metadata encoding is a reversible implementation choice.

WorkOS limits: ≤10 metadata keys, key ≤40 chars, value ≤600 chars. No tokens,
no repo content.

| Action | `wos-session` | `gh-session` | WorkOS metadata | GitHub App install |
|--------|---------------|--------------|-----------------|-------------------|
| **Connect / callback** | (signed in) | write | write | user installs |
| **Sign-out** | clear | clear | **keep** | **keep** |
| **Disconnect** | (signed in) | clear | clear bindings; rotate revocation version | keep; revoke user grant |
| **Sign-in (return)** | write | requires GitHub authorization again | read | unchanged |

Metadata restores installation identities, not credentials. Credential-free
rehydration never overwrites a live cookie. Every private request reads authoritative
bindings and checks their authorization version before user/repo access verification.
`/account` checks live GitHub installation access before showing "connected";
expired, revoked and unavailable states stay distinct. Transient errors never erase
bindings. After sign-out, use **Reconnect GitHub** to authorize access again.

### Shared browser / cross-account safety

`gh-session` is a single browser cookie, not namespaced per WorkOS user. Chronos
**never** trusts it without checking the sealed `workosUserId` against the active
AuthKit user (`readGitHubAppSessionForUser`). A leftover cookie from user A after
sign-out is ignored when user B signs in — resolve returns no session, the BFF
does not mint installation tokens from the stale binding. It also checks the
durable revocation version, so a cookie issued before disconnect cannot regain
access after a later reconnect.

WorkOS `chronosGh*` metadata is stored **on the WorkOS user record** (keyed by
user id). It is not readable across accounts and is not a cross-user leak; it
exists so the **same** user can sign back in without reinstalling the GitHub App.

### Bounded credential coordination

User refreshes share one promise per user/token within an instance, including a
60-second grace window for delayed requests. The cache is capped at 256 entries,
never logged or persisted. Across instances, the browser retries only explicit
refresh conflicts with bounded backoff; it does not automatically retry rate limits
or general provider failures. A distributed credential broker remains a future
infrastructure decision, not an implied guarantee of this cookie-based model.

Installation tokens are restricted to one repo and read permissions. Up to 256
entries are reused in process memory, expiring before GitHub's expiry and within
55 minutes. Every reuse still requires fresh durable-binding and user/repo access
checks. No repo contents or authorization decisions are cached.
Sign-out clears cookies only; disconnect clears metadata and credentials.

No multi-repo switcher (COA-201).

**Change repos** on `/account` re-enters `/api/github/connect` (fresh state),
so GitHub's configure screen returns through the same validated callback; the
callback keeps the original `connectedAt` when the installation id is unchanged.

### Owner setup (GitHub App)

1. Create a GitHub App (Settings → Developer settings → GitHub Apps).
   Allow installation on **Any account** so organizations can install it.
2. Permissions: **Contents → Read-only**, **Metadata → Read-only**. No write.
3. Setup URL: `http://localhost:3005/api/github/callback` (and production).
   Enable **Redirect on update** so Change repos lands back on `/account`.
   Register the same URL under **Callback URL** for GitHub App user authorization.
   Leave **Request user authorization during installation** off: Chronos performs
   authorization after validating the installation callback state. Keep expiring
   user access tokens enabled.
4. Webhooks: optional — disable or leave unused for v1 connect-only.
5. Generate a private key (PEM) and a client secret; note App ID, client ID and slug.
6. Env (see `.env.example`): `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
   `GITHUB_APP_PRIVATE_KEY`, `GITHUB_SESSION_PASSWORD` (≥32 chars),
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` (server-only).
   Existing deployments need the two client credentials and Callback URL before
   this update can connect repos. Users reconnect once to verify GitHub access.

## Dashboard setup (owner)

1. Create/select a WorkOS environment; copy `WORKOS_CLIENT_ID` + `WORKOS_API_KEY`.
2. Generate `WORKOS_COOKIE_PASSWORD` (`openssl rand -base64 24`).
3. Redirects: callback → `…/callback`, sign-in → `…/sign-in`.
   **Logout redirect URI** (optional for Chronos local sign-out; required if
   using AuthKit hosted logout): `http://localhost:3005/` locally and your
   production origin + `/`.
4. Authentication: enable Email+Password, GitHub, Google.
5. MFA: enable in Authentication (AuthKit hosts enrollment + challenge).
6. Passkeys: enable if desired (see below). Custom domain recommended before
   production passkeys.

## 2FA / MFA

**Status: dashboard-configured; no custom Chronos MFA UI in this slice.**

AuthKit hosted UI performs TOTP enrollment and challenge when MFA is enabled
in the WorkOS Authentication settings
([docs](https://workos.com/docs/user-management/mfa)). SSO users are exempt
per WorkOS. App code path is unchanged once AuthKit is integrated — enabling
MFA in the dashboard is the remaining operator step to satisfy the COA-200
acceptance criterion for 2FA.

## Passkeys (investigation)

**Finding:** Passkeys (WebAuthn) are available on **hosted AuthKit UI only**
([docs](https://workos.com/docs/user-management/passkeys)). Progressive
enrollment is optional. When MFA is also required, a passkey with user
verification counts as both factors (no separate TOTP prompt).

**Feasibility:** Low-friction for Chronos — enable in the WorkOS dashboard;
no additional app routes required beyond the AuthKit integration in this PR.

**Privacy:** Passkey public keys / credentials are stored by WorkOS as the
IdP, not by Chronos. Chronos continues to hold only the sealed session cookie.
Biometric material never leaves the user's device (WebAuthn model).

**Caveats:**

- Configure an AuthKit **custom domain** before enabling passkeys in
  production (credentials are origin-bound).
- Hosted AuthKit does not currently expose a self-service passkey management
  screen; deletion is via the WorkOS dashboard user record.
- Custom (non-hosted) AuthKit API UIs cannot use passkeys yet — Chronos uses
  hosted UI, so this is fine.

**Decision for this slice:** Document as **supported via dashboard toggle**;
no Chronos-specific passkey code. Owner enables when ready to ship.

## Env reference

See `.env.example`. Required for auth (all or nothing): `WORKOS_CLIENT_ID`,
`WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` (≥32 chars),
`NEXT_PUBLIC_WORKOS_REDIRECT_URI`. Omit all of them to run anonymously.

## Out of scope here

- Multi-repo switcher UI — [COA-201](https://linear.app/coalescence-labs/issue/COA-201)
- AI / Chronos Agent — Account hosts `chronosAgentOptIn`; stack + open items in [AI.md](AI.md) (architecture #4 remainder / #5 written ZDR)
