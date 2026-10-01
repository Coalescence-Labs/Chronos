"use client";

import dynamic from "next/dynamic";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

/**
 * Lazy island so AppShell (and Bun SSR tests) never statically import AuthKit.
 * AuthKit's client entry transitively loads server-only actions — fine in Next,
 * fatal under bun:test when AppShell is renderToString'd.
 *
 * When WorkOS is unconfigured, render the header ThemeToggle only so theme
 * remains available for anonymous use.
 */
const AccountControlsLazy = dynamic(
  () => import("./AccountControls").then((mod) => mod.AccountControls),
  { ssr: false, loading: () => <ThemeToggle /> },
);

export function AccountControlsGate() {
  if (!process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI) {
    return <ThemeToggle />;
  }
  return <AccountControlsLazy />;
}
