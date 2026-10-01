"use client";

import dynamic from "next/dynamic";

/**
 * Lazy island so AppShell (and Bun SSR tests) never statically import AuthKit.
 * AuthKit's client entry transitively loads server-only actions — fine in Next,
 * fatal under bun:test when AppShell is renderToString'd.
 */
const AccountControlsLazy = dynamic(
  () => import("./AccountControls").then((mod) => mod.AccountControls),
  { ssr: false, loading: () => null },
);

export function AccountControlsGate() {
  if (!process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI) {
    return null;
  }
  return <AccountControlsLazy />;
}
