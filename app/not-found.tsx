import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import buttonStyles from "@/components/ui/button.module.css";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * App Router custom 404 (COA-85). Uses EmptyState + design tokens so light/dark
 * and the shell chrome stay consistent with the rest of Chronos.
 */
export default function NotFound() {
  return (
    <AppShell>
      <EmptyState
        fill
        title="Page not found"
        hint="That address doesn't match anything here."
        action={
          <Link className={`${buttonStyles.button} ${buttonStyles.primary}`} href="/">
            Back home
          </Link>
        }
      />
    </AppShell>
  );
}
