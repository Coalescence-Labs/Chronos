"use client";

import dynamic from "next/dynamic";
import { AccountControlsSkeleton } from "./AccountControlsSkeleton";

/**
 * Lazy island so AppShell (and Bun SSR tests) never statically import AuthKit.
 * AuthKit's client entry transitively loads server-only actions — fine in Next,
 * fatal under bun:test when AppShell is renderToString'd.
 *
 * Loading fallback matches ProfileMenu footprint so signed-in users never flash
 * the signed-out "Sign in" CTA while the island or AuthKit resolves.
 */
const AccountControlsLazy = dynamic(
  () => import("./AccountControls").then((mod) => mod.AccountControls),
  { ssr: false, loading: () => <AccountControlsSkeleton /> },
);

export function AccountControlsGate() {
  if (!process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI) {
    return null;
  }
  return <AccountControlsLazy />;
}
