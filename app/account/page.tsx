import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AccountSignOutButton } from "@/components/auth/AccountSignOutButton";
import { GitHubConnectionCard } from "@/components/auth/GitHubConnectionCard";
import { AppShell } from "@/components/shell/AppShell";
import buttonStyles from "@/components/ui/button.module.css";
import { Surface } from "@/components/ui/Surface";
import { isAuthConfigured } from "@/lib/auth";
import { profileDisplayName, profileInitial } from "@/lib/auth/profile-label";
import { toPublicUser } from "@/lib/auth/session";
import { readGitHubAppSessionForUser, toPublicGitHubConnection } from "@/lib/github-app";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function AccountFrame({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className={styles.page}>
        <h1 className={styles.title}>Account</h1>
        {children}
      </div>
    </AppShell>
  );
}

function VerifiedMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Account: profile + connections. No marketing chrome, no multi-repo
 * switcher (COA-201). GitHub App connect is COA-202.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const params = await searchParams;

  if (!isAuthConfigured()) {
    return (
      <AccountFrame>
        <Surface level={1}>
          <p className={styles.copy}>
            WorkOS isn’t configured in this environment. Set the <code>WORKOS_*</code>{" "}
            variables (see <code>.env.example</code>) to enable sign-in.
          </p>
        </Surface>
      </AccountFrame>
    );
  }

  const { user } = await withAuth({ ensureSignedIn: false });

  if (!user) {
    return (
      <AccountFrame>
        <Surface level={1}>
          <p className={styles.copy}>
            Sign in with email, GitHub, or Google. Public repos don’t need an account.
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
      </AccountFrame>
    );
  }

  const publicUser = toPublicUser(user);
  const hasName = Boolean(publicUser.firstName?.trim() || publicUser.lastName?.trim());
  const gh = toPublicGitHubConnection(await readGitHubAppSessionForUser(user.id));

  return (
    <AccountFrame>
      <section aria-label="Profile">
        <Surface level={1} className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {publicUser.profilePictureUrl ? (
              <img
                className={styles.avatarImage}
                src={publicUser.profilePictureUrl}
                alt=""
                width={48}
                height={48}
                referrerPolicy="no-referrer"
              />
            ) : (
              profileInitial(publicUser)
            )}
          </span>
          <div className={styles.who}>
            <p className={styles.name}>{profileDisplayName(publicUser)}</p>
            <p className={styles.sub}>
              {hasName && <span className={styles.email}>{publicUser.email}</span>}
              {publicUser.emailVerified ? (
                <span className={styles.verified}>
                  <VerifiedMark />
                  Verified
                </span>
              ) : (
                <span className={styles.unverified}>Unverified</span>
              )}
            </p>
          </div>
          <AccountSignOutButton />
        </Surface>
      </section>

      <section className={styles.connections} aria-labelledby="connections-heading">
        <h2 id="connections-heading" className={styles.eyebrow}>
          Connections
        </h2>
        <GitHubConnectionCard connection={gh} status={params.github} />
      </section>
    </AccountFrame>
  );
}
