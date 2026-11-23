import {
  BASE_EDGE_WIDTH,
  BASE_NODE_RADIUS,
  laneColor,
  STAPLE_COLOR,
} from "@/components/graph/geometry";
import snapshot from "./chronos-graph.json";
import styles from "./home-background.module.css";

/** The snapshot's lane 0 is Chronos's own main, so it wears the trunk color. */
function snapshotColor(lane: number): string {
  return lane === 0 ? STAPLE_COLOR.trunk : laneColor(lane - 1);
}

export function HomePageBackground() {
  return (
    <div className={styles.background} aria-hidden="true">
      <svg
        className={styles.graph}
        viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}
        width={snapshot.width}
        height={snapshot.height}
        focusable="false"
      >
        <g fill="none" strokeWidth={BASE_EDGE_WIDTH} strokeLinecap="round">
          {snapshot.edges.map((edge, index) => (
            <path key={index} d={edge.d} stroke={snapshotColor(edge.lane)} />
          ))}
        </g>
        {snapshot.nodes.map((node, index) => (
          <circle
            key={index}
            cx={node.x}
            cy={node.y}
            r={BASE_NODE_RADIUS}
            fill={node.merge ? "var(--bg-elevated)" : snapshotColor(node.lane)}
            stroke={snapshotColor(node.lane)}
            strokeWidth={node.merge ? 2 : 0}
          />
        ))}
      </svg>
      <div className={styles.glass} />
    </div>
  );
}
