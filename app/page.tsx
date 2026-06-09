import { PROXY_DISCLOSURE } from "@/lib/ingest";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "32rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
          Chronos
        </h1>
        <p style={{ color: "var(--fg-muted)", lineHeight: 1.6 }}>
          See your git history at a glance. High information density, low
          cognitive load.
        </p>
        <p style={{ color: "var(--fg-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
          {PROXY_DISCLOSURE}
        </p>
      </div>
    </main>
  );
}
