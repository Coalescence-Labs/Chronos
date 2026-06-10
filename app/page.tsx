import Link from "next/link";
import { RepoUrlForm } from "@/components/repo/RepoUrlForm";
import { AppShell } from "@/components/shell/AppShell";
import { PROXY_DISCLOSURE } from "@/lib/ingest";
import styles from "./page.module.css";

export default function Home() {
  return (
    <AppShell>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.title}>See your git history at a glance.</h1>
          <p className={styles.tagline}>
            Chronos turns any repo into a beautiful, legible branch graph. High
            information density, low cognitive load.
          </p>
          <RepoUrlForm />
          <p className={styles.demoHint}>
            …or <Link href="/demo">explore the demo repo</Link> — no network needed.
          </p>
          <p className={styles.disclosure}>{PROXY_DISCLOSURE}</p>
        </div>
      </section>
    </AppShell>
  );
}
