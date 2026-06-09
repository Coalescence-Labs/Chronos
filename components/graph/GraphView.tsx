import type { GraphLayout } from "@/lib/graph";

/**
 * Renders a GraphLayout. Decision #2: SVG with viewport virtualization.
 * Keep all rendering behind this component's interface so the renderer is
 * swappable without touching lib/graph, and keep it free of hosted-only
 * APIs so the phase-2 zero-native shell can reuse it.
 */

const ROW_HEIGHT = 32;
const LANE_WIDTH = 24;

export interface GraphViewProps {
  layout: GraphLayout;
}

export function GraphView({ layout }: GraphViewProps) {
  const height = Math.max(layout.placements.length * ROW_HEIGHT, ROW_HEIGHT);
  const width = Math.max(layout.laneCount * LANE_WIDTH, LANE_WIDTH);

  return (
    <svg
      role="img"
      aria-label="Git branch graph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      {layout.placements.map((commit) => (
        <circle
          key={commit.sha}
          cx={commit.lane * LANE_WIDTH + LANE_WIDTH / 2}
          cy={commit.row * ROW_HEIGHT + ROW_HEIGHT / 2}
          r={4}
          fill="var(--accent)"
        />
      ))}
    </svg>
  );
}
