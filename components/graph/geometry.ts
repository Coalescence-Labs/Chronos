export const BASE_ROW_HEIGHT = 44; // --touch-target at zoom 1
export const BASE_LANE_WIDTH = 18;
export const BASE_NODE_RADIUS = 4.5;
export const BASE_EDGE_WIDTH = 1.75;

const LANE_COLOR_COUNT = 8; // --lane-0 … --lane-7 in app/globals.css

export function laneColor(lane: number): string {
  return `var(--lane-${lane % LANE_COLOR_COUNT})`;
}

/** Child→parent path with half-row S-curves through the via lane. */
export function edgePath(
  x0: number,
  y0: number,
  xVia: number,
  x1: number,
  y1: number,
  rowHeight: number,
): string {
  if (x0 === xVia && xVia === x1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  if (y1 - y0 <= rowHeight) {
    const yMid = (y0 + y1) / 2;
    return `M ${x0} ${y0} C ${x0} ${yMid}, ${x1} ${yMid}, ${x1} ${y1}`;
  }
  const parts = [`M ${x0} ${y0}`];
  let yCursor = y0;
  if (xVia !== x0) {
    const yBend = y0 + rowHeight;
    const yMid = y0 + rowHeight / 2;
    parts.push(`C ${x0} ${yMid}, ${xVia} ${yMid}, ${xVia} ${yBend}`);
    yCursor = yBend;
  }
  if (xVia !== x1) {
    const yBend = y1 - rowHeight;
    if (yBend > yCursor) parts.push(`L ${xVia} ${yBend}`);
    const yMid = y1 - rowHeight / 2;
    parts.push(`C ${xVia} ${yMid}, ${x1} ${yMid}, ${x1} ${y1}`);
  } else {
    parts.push(`L ${xVia} ${y1}`);
  }
  return parts.join(" ");
}
