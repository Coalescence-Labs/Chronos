"use client";

import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

/** Account-page sign-out — local cookie clear + hard same-origin home. */
export function AccountSignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => {
        void (async () => {
          try {
            await signOutAction();
          } catch {
            // redirect() from the server action throws; continue to hard nav.
          }
          window.location.assign(`${window.location.origin}/`);
        })();
      }}
    >
      Sign out
    </Button>
  );
}
