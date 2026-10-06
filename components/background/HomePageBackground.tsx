import { BASE_EDGE_WIDTH, BASE_NODE_RADIUS, laneColor } from "@/components/graph/geometry";
import snapshot from "./chronos-graph.json";
import styles from "./home-background.module.css";

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
            <path key={index} d={edge.d} stroke={laneColor(edge.lane)} />
          ))}
        </g>
        {snapshot.nodes.map((node, index) => (
          <circle
            key={index}
            cx={node.x}
            cy={node.y}
            r={BASE_NODE_RADIUS}
            fill={node.merge ? "var(--bg-elevated)" : laneColor(node.lane)}
            stroke={laneColor(node.lane)}
            strokeWidth={node.merge ? 2 : 0}
          />
        ))}
      </svg>
      <div className={styles.glass} />
    </div>
  );
}
