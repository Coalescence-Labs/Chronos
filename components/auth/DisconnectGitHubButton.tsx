"use client";

import { disconnectGitHubAction } from "@/lib/github-oauth/actions";
import { Button } from "@/components/ui/Button";

/** Account-page disconnect — clears sealed GitHub OAuth session. */
export function DisconnectGitHubButton() {
  return (
    <Button
      type="button"
      variant="ghost"
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
      Disconnect GitHub
    </Button>
  );
}
