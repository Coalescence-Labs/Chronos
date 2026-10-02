import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * App Router custom 404 (COA-85). EmptyState + shell only — the header Chronos
 * mark already links home (no extra "Back home" CTA / underline noise).
 */
export default function NotFound() {
  return (
    <AppShell>
      <EmptyState
        fill
        title="Page not found"
        hint="That address doesn't match anything here."
      />
    </AppShell>
  );
}
