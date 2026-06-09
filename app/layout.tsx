import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { CHROME_BG } from "@/lib/theme";
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
  themeColor: CHROME_BG,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={satoshi.variable}>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
