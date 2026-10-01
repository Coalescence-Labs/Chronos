import type { Metadata } from "next";
import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { AccountSignOutButton } from "@/components/auth/AccountSignOutButton";
import { AppShell } from "@/components/shell/AppShell";
import buttonStyles from "@/components/ui/button.module.css";
import { Surface } from "@/components/ui/Surface";
import { isAuthConfigured } from "@/lib/auth";
import { toPublicUser } from "@/lib/auth/session";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Minimal functional account surface for auth smoke-testing.
 * No marketing chrome, no multi-repo switcher (COA-201).
 */
export default async function AccountPage() {
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
        </dl>
        <p className={styles.disclosure}>
          Session is stored in an encrypted httpOnly cookie. Tokens never reach
          browser JavaScript. Repo content is not part of this account session.
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
