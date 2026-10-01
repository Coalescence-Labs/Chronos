# Auth — WorkOS AuthKit (COA-200)

> Binding privacy rules live in [PRIVACY.md](PRIVACY.md). This doc is the
> engineering + investigation notes for user accounts.

## Shape

Chronos uses **WorkOS AuthKit** (`@workos-inc/authkit-nextjs`) for optional
user accounts. Authentication is **not required** for public-URL paste or
`/demo`.

```
Browser ──► /sign-in|/sign-up ──► WorkOS AuthKit hosted UI
                ▲                        │
                │                        ▼
           /callback ◄── code exchange + sealed session cookie
                │
                ▼
     encrypted httpOnly cookie (wos-session)
     tokens never exposed to browser JS
```

Routes:

| Path | Role |
|------|------|
| `/sign-in` | WorkOS dashboard **Sign-in endpoint** (`initiate_login_uri`) |
| `/sign-up` | AuthKit sign-up screen hint |
| `/callback` | `handleAuth()` — code → sealed cookie |
| `/api/auth/sign-in` | Alias of `/sign-in` |
| `/api/auth/sign-up` | Alias of `/sign-up` |
| `/api/auth/sign-out` | **POST only** — clears session (prefer `signOutAction`) |
| `/api/auth/me` | Public session JSON (no tokens) |
| `/account` | Minimal smoke UI |

Sign-out must never be a GET route (prefetch / CSRF). Use the server action
`signOutAction` from `lib/auth/actions.ts`.

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
| **Connect GitHub for repos** (API access, rate limits, private later) | Separate GitHub OAuth app / BFF token (decision #7) | COA-79 / COA-202 |

These must not be conflated. WorkOS GitHub login does **not** grant Chronos a
GitHub API token for ingestion. Repo OAuth remains a distinct consent +
privacy surface.

## Dashboard setup (owner)

1. Create/select a WorkOS environment; copy `WORKOS_CLIENT_ID` + `WORKOS_API_KEY`.
2. Generate `WORKOS_COOKIE_PASSWORD` (`openssl rand -base64 24`).
3. Redirects: callback → `…/callback`, sign-in → `…/sign-in`, logout → `/`.
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
- Private-repo GitHub connect — [COA-202](https://linear.app/coalescence-labs/issue/COA-202)
- AI features / ZDR provider (open decisions #4 / #5)
