"use client";

import { disconnectGitHubAction } from "@/lib/github-app/actions";
import { Button } from "@/components/ui/Button";

/** Account-page disconnect — clears sealed session + best-effort uninstall. */
export function DisconnectGitHubButton() {
  return (
    <Button
      type="button"
      variant="danger"
      onClick={() => {
        void (async () => {
          try {
            await disconnectGitHubAction();
          } catch {
            // redirect() from the server action throws; hard-nav as fallback.
          }
          window.location.assign(`${window.location.origin}/account?github=disconnected`);
        })();
      }}
    >
      Disconnect
    </Button>
  );
}
