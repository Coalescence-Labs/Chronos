import type { Metadata } from "next";
import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AccountSignOutButton } from "@/components/auth/AccountSignOutButton";
import { DisconnectGitHubButton } from "@/components/auth/DisconnectGitHubButton";
import { AppShell } from "@/components/shell/AppShell";
import buttonStyles from "@/components/ui/button.module.css";
import { Surface } from "@/components/ui/Surface";
import { isAuthConfigured } from "@/lib/auth";
import { toPublicUser } from "@/lib/auth/session";
import {
  GITHUB_APP_PERMISSIONS_LABEL,
  isGitHubAppConfigured,
  readGitHubAppSessionForUser,
  toPublicGitHubConnection,
} from "@/lib/github-app";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function githubStatusMessage(status: string | undefined): string | null {
  switch (status) {
    case "connected":
      return "GitHub App installed. Private repos you selected will load via Chronos; installation access tokens stay on the server.";
    case "disconnected":
      return "GitHub disconnected on Chronos. If the App still appears under GitHub → Settings → Applications, uninstall it there too.";
    case "denied":
      return "GitHub App install was cancelled. Nothing was stored.";
    case "unconfigured":
      return "GitHub App is not configured in this environment.";
    case "error":
      return "Could not connect GitHub. Try again, or check App credentials.";
    default:
      return null;
  }
}

/**
 * Minimal functional account surface for auth smoke-testing.
 * No marketing chrome, no multi-repo switcher (COA-201).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const params = await searchParams;
  const statusMessage = githubStatusMessage(params.github);

  if (!isAuthConfigured()) {
    return (
      <AppShell>
        <Surface level={1} className={styles.panel}>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.copy}>
            WorkOS is not configured in this environment. Set the{" "}
            <code>WORKOS_*</code> variables (see <code>.env.example</code>) to
            enable sign-in.
          </p>
          <Link className={`${buttonStyles.button} ${buttonStyles.ghost}`} href="/">
            Back home
          </Link>
        </Surface>
      </AppShell>
    );
  }

  const { user } = await withAuth({ ensureSignedIn: false });

  if (!user) {
    return (
      <AppShell>
        <Surface level={1} className={styles.panel}>
          <h1 className={styles.title}>Account</h1>
          <p className={styles.copy}>
            Sign in with email, GitHub, or Google via WorkOS AuthKit. Public
            repo viewing does not require an account.
          </p>
          <div className={styles.actions}>
            <Link
              className={`${buttonStyles.button} ${buttonStyles.primary}`}
              href="/sign-in?returnTo=%2Faccount"
              prefetch={false}
            >
              Sign in
            </Link>
            <Link
              className={`${buttonStyles.button} ${buttonStyles.ghost}`}
              href="/sign-up?returnTo=%2Faccount"
              prefetch={false}
            >
              Create account
            </Link>
          </div>
        </Surface>
      </AppShell>
    );
  }

  const publicUser = toPublicUser(user);
  const ghSession = await readGitHubAppSessionForUser(user.id);
  const gh = toPublicGitHubConnection(ghSession);
  const githubReady = isGitHubAppConfigured();

  return (
    <AppShell>
      <Surface level={1} className={styles.panel}>
        <h1 className={styles.title}>Account</h1>
        <dl className={styles.meta}>
          <div>
            <dt>Email</dt>
            <dd>{publicUser.email}</dd>
          </div>
          {(publicUser.firstName || publicUser.lastName) && (
            <div>
              <dt>Name</dt>
              <dd>
                {[publicUser.firstName, publicUser.lastName].filter(Boolean).join(" ")}
              </dd>
            </div>
          )}
          <div>
            <dt>Email verified</dt>
            <dd>{publicUser.emailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>GitHub (repos)</dt>
            <dd>
              {gh.connected
                ? `Installed for @${gh.login}`
                : githubReady
                  ? "Not connected"
                  : "GitHub App not configured"}
            </dd>
          </div>
        </dl>

        {statusMessage && <p className={styles.copy}>{statusMessage}</p>}

        <section className={styles.githubSection} aria-labelledby="github-connect-heading">
          <h2 id="github-connect-heading" className={styles.sectionTitle}>
            Connect GitHub
          </h2>
          <p className={styles.disclosure}>
            Optional. Install the Chronos GitHub App to load private
            repositories you select and use an authenticated rate-limit budget
            instead of the shared anonymous pool. Permissions are truly
            read-only: <code>{GITHUB_APP_PERMISSIONS_LABEL}</code> — Chronos
            never requests write. Only the installation id (and account login)
            is stored in an encrypted httpOnly server session; short-lived
            installation tokens are minted on the server when the BFF calls
            GitHub. Repo content is proxied transiently and never persisted.
            Disconnect clears the Chronos session and attempts to uninstall the
            App; you can also remove it under GitHub → Settings → Applications.
            This is separate from &quot;Sign in with GitHub&quot; (account
            identity).
          </p>
          <div className={styles.actions}>
            {gh.connected ? (
              <DisconnectGitHubButton />
            ) : githubReady ? (
              <Link
                className={`${buttonStyles.button} ${buttonStyles.primary}`}
                href="/api/github/connect"
                prefetch={false}
              >
                Install GitHub App
              </Link>
            ) : (
              <span className={styles.copy}>
                Set <code>GITHUB_APP_*</code> and{" "}
                <code>GITHUB_SESSION_PASSWORD</code> to enable.
              </span>
            )}
          </div>
        </section>

        <p className={styles.disclosure}>
          Chronos account session is stored in an encrypted httpOnly cookie.
          Tokens never reach browser JavaScript.
        </p>
        <div className={styles.actions}>
          <AccountSignOutButton />
          <Link className={`${buttonStyles.button} ${buttonStyles.ghost}`} href="/">
            Back home
          </Link>
        </div>
      </Surface>
    </AppShell>
  );
}
