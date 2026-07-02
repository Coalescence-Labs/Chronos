import type { Metadata } from "next";
import { TrackMount } from "@/components/analytics/TrackMount";
import { GraphExplorer } from "@/components/repo/GraphExplorer";
import { AppShell } from "@/components/shell/AppShell";
import { DEMO_OWNER, DEMO_REPO, demoHistory } from "@/lib/demo/history";

/**
 * /demo — the full graph experience on synthetic history. Zero network,
 * zero GitHub rate limit; useful for showing Chronos and for developing
 * visuals when the API budget is spent.
 */

export const metadata: Metadata = {
  title: "Demo — Chronos",
  description: "Explore the Chronos branch graph on a synthetic repository.",
};

export default function DemoPage() {
  return (
    <AppShell>
      <TrackMount event={{ name: "demo_view" }} />
      <GraphExplorer
        history={demoHistory()}
        owner={DEMO_OWNER}
        repo={DEMO_REPO}
        status="synthetic history · nothing fetched, no rate limits"
      />
    </AppShell>
  );
}
