import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * Branded social card (COA-126), generated at build/edge. Intentionally
 * generic — no repo identity — so /repo/* can safely inherit it (the route is
 * noindex, but link previews must never reveal a viewed repo). On-brand dark
 * surface + aurora wash + the Chronos commit-graph mark.
 */

export const runtime = "edge";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Shared render so app/twitter-image.tsx can reuse the exact same card. */
export function renderOgCard() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "96px",
        background: "#0a0c10",
        backgroundImage:
          "radial-gradient(900px 520px at 12% -10%, rgba(124,156,255,0.22), transparent 60%)," +
          "radial-gradient(760px 460px at 92% 6%, rgba(167,139,250,0.16), transparent 60%)," +
          "radial-gradient(620px 420px at 60% 116%, rgba(94,234,212,0.10), transparent 65%)",
        color: "#e8eaf0",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        {/* The commit-graph brand mark (same paths as the in-app BrandMark). */}
        <svg width="96" height="96" viewBox="0 0 40 40" fill="none">
          <path d="M14 32V18" stroke="#7c9cff" strokeWidth="3" strokeLinecap="round" />
          <path d="M14 24c0-6 12-4 12-12" stroke="#7c9cff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="14" cy="34" r="4.5" fill="#7c9cff" />
          <circle cx="14" cy="16" r="4.5" fill="#7c9cff" />
          <circle cx="26" cy="10" r="4.5" fill="#a78bfa" />
        </svg>
        <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em" }}>{SITE_NAME}</span>
      </div>
      <div style={{ marginTop: "36px", fontSize: 52, fontWeight: 600, color: "#e8eaf0" }}>
        {SITE_TAGLINE}
      </div>
      <div style={{ marginTop: "20px", fontSize: 30, color: "#99a1b3" }}>
        A beautiful, fast git branch-graph visualizer.
      </div>
    </div>,
    size,
  );
}

export default function OpengraphImage() {
  return renderOgCard();
}
