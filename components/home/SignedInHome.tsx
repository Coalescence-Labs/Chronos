import { HomePageBackground } from "@/components/background/HomePageBackground";
import { RepoUrlForm } from "@/components/repo/RepoUrlForm";
import { AppShell } from "@/components/shell/AppShell";
import { RepoLibraryContainer } from "./RepoLibrary";
import styles from "./home.module.css";

/**
 * The signed-in alternate to the public welcome page (COA-151): same
 * background and centered repo field, with the user's pinned and recent repos
 * below. No marketing copy, no identity in the HTML.
 */
export function SignedInHome() {
  return (
    <div className={styles.home}>
      <HomePageBackground />
      <AppShell>
        <div className={styles.page}>
          <h1 className={styles.visuallyHidden}>Chronos</h1>
          <RepoUrlForm />
          <RepoLibraryContainer />
        </div>
      </AppShell>
    </div>
  );
}
