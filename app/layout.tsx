import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { CHROME_BG, CHROME_BG_LIGHT, THEME_INIT_SCRIPT } from "@/lib/theme";
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
  // Tracks the system scheme; an explicit in-app override only retints the
  // browser chrome, never the app surface itself (tokens own that).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: CHROME_BG_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: CHROME_BG },
  ],
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
