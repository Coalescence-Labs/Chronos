import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import buttonStyles from "@/components/ui/button.module.css";
import { Surface } from "@/components/ui/Surface";
import type { PublicGitHubConnection } from "@/lib/github-app/types";
import { DisconnectGitHubButton } from "./DisconnectGitHubButton";
import styles from "./github-connection.module.css";

/**
 * Account-page GitHub App card (COA-202). Before install, every consent fact
 * is visible (docs/PRIVACY.md pre-flight #5); once connected they collapse
 * behind "Access and privacy" — the user already read them to get here.
 */

const CONNECT_HREF = "/api/github/connect";
const GITHUB_INSTALLATIONS_URL = "https://github.com/settings/installations";

function GitHubSettingsLink() {
  return (
    <a href={GITHUB_INSTALLATIONS_URL} target="_blank" rel="noreferrer">
      GitHub settings
    </a>
  );
}

const FACTS: { claim: string; detail: ReactNode }[] = [
  { claim: "Read-only access", detail: "Contents and metadata. Can’t push or edit." },
  { claim: "Repos you choose", detail: "Only the ones you pick on GitHub." },
  { claim: "No repo data stored", detail: "Commits pass through to draw the graph." },
  { claim: "Encrypted session", detail: "Install ID and username. No tokens saved." },
  {
    claim: "Revoke anytime",
    detail: (
      <>
        Disconnect here or in <GitHubSettingsLink />.
      </>
    ),
  },
];

type BannerTone = "success" | "neutral" | "danger";

const BANNERS: Record<string, { tone: BannerTone; message: ReactNode }> = {
  connected: { tone: "success", message: "Connected. Repos you selected will now load." },
  disconnected: {
    tone: "neutral",
    message: (
      <>
        Disconnected. Still in <GitHubSettingsLink />? Uninstall it there.
      </>
    ),
  },
  denied: { tone: "neutral", message: "Install cancelled. Nothing was saved." },
  error: { tone: "danger", message: "Couldn’t connect to GitHub. Try again." },
};

function GitHubMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

function ExternalArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3h7v7M13 3L4 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className={styles.chevron} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Facts({ className }: { className?: string }) {
  return (
    <dl className={className}>
      {FACTS.map((fact) => (
        <Fragment key={fact.claim}>
          <dt>{fact.claim}</dt>
          <dd>{fact.detail}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function StatusBanner({ status, connected }: { status: string | undefined; connected: boolean }) {
  const banner = status ? BANNERS[status] : undefined;
  if (!banner || (status === "connected" && !connected)) return null;
  return (
    <div
      className={styles.banner}
      data-tone={banner.tone}
      role={banner.tone === "danger" ? "alert" : "status"}
    >
      <span className={styles.bannerDot} aria-hidden="true" />
      <p className={styles.bannerText}>{banner.message}</p>
      <Link
        className={styles.bannerDismiss}
        href="/account"
        replace
        scroll={false}
        prefetch={false}
        aria-label="Dismiss"
      >
        ✕
      </Link>
    </div>
  );
}

export interface GitHubConnectionCardProps {
  connection: PublicGitHubConnection;
  /** `?github=` result from connect / callback / disconnect. */
  status?: string;
}

export function GitHubConnectionCard({ connection, status }: GitHubConnectionCardProps) {
  if (!connection.configured) {
    return (
      <Surface level={1} padded={false} className={styles.card}>
        <div className={styles.header}>
          <span className={`${styles.glyph} ${styles.glyphMuted}`}>
            <GitHubMark />
          </span>
          <h3 className={`${styles.name} ${styles.nameMuted}`}>
            GitHub <span className={styles.badge}>unavailable</span>
          </h3>
          <p className={styles.desc}>
            Set <code>GITHUB_APP_*</code> and <code>GITHUB_SESSION_PASSWORD</code> to enable.
          </p>
        </div>
      </Surface>
    );
  }

  if (!connection.connected) {
    return (
      <Surface level={1} padded={false} className={styles.card}>
        <StatusBanner status={status} connected={false} />
        <div className={styles.header}>
          <span className={styles.glyph}>
            <GitHubMark />
          </span>
          <h3 className={styles.name}>
            GitHub <span className={styles.badge}>not connected</span>
          </h3>
          <p className={styles.desc}>Private repos and higher rate limits.</p>
          <div className={styles.actions}>
            <a className={`${buttonStyles.button} ${buttonStyles.primary}`} href={CONNECT_HREF}>
              Install GitHub App
            </a>
          </div>
        </div>
        <Facts className={styles.facts} />
      </Surface>
    );
  }

  const since = connection.connectedAt?.slice(0, 10);

  return (
    <Surface level={1} padded={false} className={styles.card}>
      <StatusBanner status={status} connected />
      <div className={styles.header}>
        <span className={styles.glyph}>
          <GitHubMark />
        </span>
        <h3 className={styles.name}>
          GitHub{" "}
          <span className={styles.badge} data-connected="">
            <span className={styles.badgeDot} aria-hidden="true" />
            connected
          </span>
        </h3>
        <p className={styles.meta}>
          <span className={styles.login}>@{connection.login}</span>
          {since && (
            <>
              {" · "}
              <span className={styles.nowrap}>since {since}</span>
            </>
          )}
        </p>
        <div className={styles.actions}>
          <DisconnectGitHubButton />
        </div>
      </div>
      <div className={styles.more}>
        <details>
          <summary className={styles.summary}>
            <Chevron />
            Access and privacy
          </summary>
          <Facts className={`${styles.facts} ${styles.factsNested}`} />
        </details>
        <a className={styles.manage} href={CONNECT_HREF}>
          Change repos
          <ExternalArrow />
        </a>
      </div>
    </Surface>
  );
}
