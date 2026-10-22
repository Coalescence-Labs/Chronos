"use client";

import { disconnectGitHubAction } from "@/lib/github-app/actions";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./github-connection.module.css";

/** Account-page disconnect with explicit failure recovery and duplicate-submit protection. */
export function DisconnectGitHubButton({ all = false }: { all?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
    <Button
      type="button"
      variant="danger"
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true); setError("");
        void (async () => {
          try {
            const result = await disconnectGitHubAction();
            if (!result.ok) { setError(result.message); return; }
            router.replace(`/account?github=${result.warning ? "disconnected-manual" : "disconnected"}`);
            router.refresh();
          } catch {
            setError("Couldn't confirm that GitHub disconnected. Please retry.");
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      {busy ? "Disconnecting…" : all ? "Disconnect all" : "Disconnect"}
    </Button>
    {error && <p className={styles.actionError} role="alert">{error}</p>}
    </>
  );
}
