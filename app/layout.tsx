import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { satoshi } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chronos — see your git history at a glance",
  description:
    "A beautiful, fast git branch-graph visualizer. High information density, low cognitive load.",
  applicationName: "Chronos",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Chronos" },
};

export const viewport: Viewport = {
  // viewport-fit=cover lets the surface extend under the status bar / dynamic
  // island. theme-color is owned by the boot script + ThemeToggle (a single
  // JS-managed <meta>) so the mobile status bar tracks the *resolved* active
  // theme — even on an explicit in-app override, not just the system scheme.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme on <html>
    // before React hydrates, which is an intentional server/client mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the persisted theme before first paint — see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={satoshi.variable}>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
