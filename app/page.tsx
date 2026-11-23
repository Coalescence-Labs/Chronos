import Link from "next/link";
import { HomePageBackground } from "@/components/background/HomePageBackground";
import { RepoUrlForm } from "@/components/repo/RepoUrlForm";
import { SignedInHome } from "@/components/home/SignedInHome";
import { AppShell } from "@/components/shell/AppShell";
import { isSignedIn } from "@/lib/auth/home-session";
import { PROXY_DISCLOSURE } from "@/lib/ingest";
import styles from "./page.module.css";

function PublicHome() {
  return (
    <div className={styles.home}>
      <HomePageBackground />
      <AppShell skipLink={false}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <h1 className={styles.title}>See your git history at a glance.</h1>
            <p className={styles.tagline}>
              Chronos turns any repo into a beautiful, legible branch graph.
              <br />
              High information density, low cognitive load.
            </p>
            <RepoUrlForm />
            <p className={styles.demoHint}>
              …or <Link href="/demo">explore the demo repo</Link>.
            </p>
          </div>
        </section>
        <section className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.disclosure}>{PROXY_DISCLOSURE}</p>
          </div>
        </section>
      </AppShell>
    </div>
  );
}

/**
 * `/` has two faces: the public welcome page, and a quieter signed-in home with
 * the user's pinned and recent repos (COA-151). Anything short of a confirmed
 * session gets the public page.
 */
export default async function Home() {
  return (await isSignedIn()) ? <SignedInHome /> : <PublicHome />;
}
