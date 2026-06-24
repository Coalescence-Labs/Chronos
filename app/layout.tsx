import type { Metadata, Viewport } from "next";
import { ChronosAnalytics } from "@/components/analytics/ChronosAnalytics";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { CHROME_BG, THEME_INIT_SCRIPT } from "@/lib/theme";
import { satoshi } from "./fonts";
import "./globals.css";

const TITLE_DEFAULT = `${SITE_NAME} — ${SITE_TAGLINE.replace(/\.$/, "").toLowerCase()}`;

export const metadata: Metadata = {
  // Absolute base for canonicals + OG/Twitter image URLs (COA-126).
  metadataBase: new URL(SITE_URL),
  // "%s — Chronos" for child routes; the home/default keeps the full tagline.
  title: { default: TITLE_DEFAULT, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: SITE_NAME },
  alternates: { canonical: "/" },
  // Marketing surface is indexable by default; /repo/* and /styleguide opt out.
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    // The branded card at app/opengraph-image is picked up automatically and
    // is intentionally generic — safe to inherit on /repo/* (no repo identity).
  },
  twitter: { card: "summary_large_image", title: TITLE_DEFAULT, description: SITE_DESCRIPTION },
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
        {/* Applies the persisted theme before first paint — see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={satoshi.variable}>
        {children}
        <ServiceWorkerRegistrar />
        {/* Analytics + Speed Insights with URL scrubbing & kill switch (COA-96). */}
        <ChronosAnalytics />
      </body>
    </html>
  );
}
