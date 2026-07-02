import type { Metadata } from "next";

/**
 * The styleguide is an internal development surface (not linked from the
 * product). Keep it out of search indexes (COA-126). A layout carries the
 * metadata because the page itself is a client component.
 */
export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false, follow: false },
};

export default function StyleguideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
