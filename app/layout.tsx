import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { CHROME_BG, THEME_INIT_SCRIPT } from "@/lib/theme";
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
  // Primary: viewport-fit=cover + the full-bleed background (globals.css
  // body::before) run the gradient under the status bar / home indicator on
  // modern browsers, seamlessly.
  // Fallback: a single static theme-color (dark baseline) for older OSes and
  // Android Chrome's toolbar where the full-bleed doesn't reach. It's rendered
  // once here and only *updated* post-mount by ThemeToggle (syncThemeColor) —
  // the boot script never touches it, which previously caused a duplicate.
  themeColor: CHROME_BG,
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
        {/* Applies the persisted theme + sets the single theme-color meta
            before first paint — see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Analytics />
      </head>
      <body className={satoshi.variable}>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
