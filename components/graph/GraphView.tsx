"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { branchLines, packShelves, pinnedLines } from "@/lib/graph";
import type { GraphLayout, RepoHistory } from "@/lib/graph";
import styles from "./graph.module.css";

/**
 * Renders a GraphLayout. Decision #2 (docs/ARCHITECTURE.md): SVG nodes/edges
 * with viewport virtualization — only rows near the scroll window touch the
 * DOM, so a 20k-commit history stays smooth on a phone. Everything stays
 * behind this component's interface (swappable without touching lib/graph)
 * and free of hosted-only APIs so the phase-2 zero-native shell can reuse it.
 *
 * Interaction model:
 * - pan = native scrolling (momentum and scrollbars for free)
 * - zoom = +/− buttons, ctrl/cmd + wheel (trackpad pinch), two-finger pinch
 * - inspect = tap/click a row, or arrows/Home/End on the focused graph;
 *   Escape clears. Selection follows the keyboard cursor (single-select
 *   listbox pattern with aria-activedescendant, which survives virtualization)
 * - merges read by shape, not color alone: merge commits are hollow rings
 */

const BASE_ROW_HEIGHT = 44; // --touch-target at zoom 1
const BASE_LANE_WIDTH = 18;
const OVERSCAN_ROWS = 10;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.75;
const ZOOM_STEP = 1.2;
const LANE_COLOR_COUNT = 8; // --lane-0 … --lane-7 in app/globals.css

function laneColor(lane: number): string {
  return `var(--lane-${lane % LANE_COLOR_COUNT})`;
}

/** Long-term branches render as filled pills (main is always lane 0). */
function branchRole(name: string): "main" | "develop" | undefined {
  const base = name.toLowerCase();
  if (base === "main" || base === "master" || base === "trunk") return "main";
  if (base === "develop" || base === "dev" || base === "development") return "develop";
  return undefined;
}

/** A row label: a live ref, or a branch name recovered from a merge commit. */
interface RefLabel {
  name: string;
  type: "branch" | "tag" | "merged";
}

/** Rough pill width (text-xs ≈ 6.2px/char, capped by the 9rem ellipsis). */
function estimateBadgeWidth(name: string): number {
  return Math.min(144, name.length * 6.2 + 18);
}

const SHELF_HEIGHT = 26;

/**
 * Child→parent path: drop out of the child, travel down the via lane, and
 * curve into the parent. Bends are smooth half-row S-curves; the degenerate
 * one-row gap collapses to a single curve.
 */
function edgePath(
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

export interface GraphViewProps {
  history: RepoHistory;
  layout: GraphLayout;
  selectedSha?: string | null;
  onSelect?: (sha: string | null) => void;
  /**
   * Fired when the rendered window reaches the oldest loaded rows — the
   * hook for lazy paging. Re-fires after new rows arrive if still near the
   * end, so short histories backfill until they outgrow the viewport.
   */
  onNearEnd?: () => void;
}

export function GraphView({
  history,
  layout,
  selectedSha = null,
  onSelect,
  onNearEnd,
}: GraphViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const pendingScrollTop = useRef<number | null>(null);
  const scrollFrame = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const rowHeight = BASE_ROW_HEIGHT * zoom;
  const laneWidth = BASE_LANE_WIDTH * zoom;
  const graphWidth = Math.max(layout.laneCount, 1) * laneWidth + laneWidth / 2;
  const rowCount = layout.placements.length;
  const totalHeight = Math.max(rowCount, 1) * rowHeight;

  const commitsBySha = useMemo(
    () => new Map(history.commits.map((commit) => [commit.sha, commit])),
    [history.commits],
  );
  const lines = useMemo(() => branchLines(history, layout), [history, layout]);

  const labelsBySha = useMemo(() => {
    const map = new Map<string, RefLabel[]>();
    const push = (sha: string, label: RefLabel) => {
      const list = map.get(sha);
      if (list) list.push(label);
      else map.set(sha, [label]);
    };
    for (const ref of history.refs) {
      if (ref.type === "head") continue; // HEAD duplicates the default branch ref
      push(ref.sha, { name: ref.name, type: ref.type });
    }
    // Merged branches keep their recovered name at their tip-most commit.
    for (const line of lines) {
      if (line.source === "merge") push(line.tipSha, { name: line.name, type: "merged" });
    }
    return map;
  }, [history.refs, lines]);

  const selectedRow = useMemo(
    () => (selectedSha ? layout.placements.findIndex((p) => p.sha === selectedSha) : -1),
    [layout.placements, selectedSha],
  );

  /** Zoom keeping the content under `anchorY` (viewport px) stationary. */
  const setZoomAnchored = useCallback((nextRaw: number, anchorY?: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextRaw));
    const prev = zoomRef.current;
    if (next === prev) return;
    zoomRef.current = next;
    const el = viewportRef.current;
    if (el) {
      const y = anchorY ?? el.clientHeight / 2;
      pendingScrollTop.current = ((el.scrollTop + y) * next) / prev - y;
    }
    setZoom(next);
  }, []);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el && pendingScrollTop.current !== null) {
      el.scrollTop = pendingScrollTop.current;
      pendingScrollTop.current = null;
      setScrollTop(el.scrollTop);
    }
  }, [zoom]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // React registers wheel/touch listeners passively; zoom gestures need
  // preventDefault, so attach them directly with { passive: false }.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return; // plain wheel = native scroll
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.002);
      setZoomAnchored(zoomRef.current * factor, event.clientY - el.getBoundingClientRect().top);
    };

    let pinchDistance = 0;
    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0]!.clientX - touches[1]!.clientX,
        touches[0]!.clientY - touches[1]!.clientY,
      );
    const onTouchStart = (event: TouchEvent) => {
      pinchDistance = event.touches.length === 2 ? distance(event.touches) : 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault(); // keep the page from pinch-zooming under us
      const next = distance(event.touches);
      if (pinchDistance > 0) {
        const midY =
          (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2 -
          el.getBoundingClientRect().top;
        setZoomAnchored(zoomRef.current * (next / pinchDistance), midY);
      }
      pinchDistance = next;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [setZoomAnchored]);

  const handleScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const el = viewportRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  const scrollRowIntoView = useCallback((row: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const height = BASE_ROW_HEIGHT * zoomRef.current;
    const top = row * height;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + height > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + height - el.clientHeight;
    }
  }, []);

  /** Scroll so `row` sits at the top — used by pinned badges to jump to a tip. */
  const scrollToRow = useCallback((row: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const top = Math.max(0, row * BASE_ROW_HEIGHT * zoomRef.current - 4);
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (rowCount === 0) return;
      if (event.key === "Escape") {
        onSelect?.(null);
        return;
      }
      const pageRows = Math.max(1, Math.floor(viewportHeight / rowHeight) - 1);
      let next: number;
      switch (event.key) {
        case "ArrowDown":
          next = Math.min(rowCount - 1, selectedRow + 1);
          break;
        case "ArrowUp":
          next = selectedRow < 0 ? rowCount - 1 : Math.max(0, selectedRow - 1);
          break;
        case "PageDown":
          next = Math.min(rowCount - 1, Math.max(0, selectedRow) + pageRows);
          break;
        case "PageUp":
          next = Math.max(0, (selectedRow < 0 ? rowCount - 1 : selectedRow) - pageRows);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = rowCount - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      onSelect?.(layout.placements[next]!.sha);
      scrollRowIntoView(next);
    },
    [rowCount, viewportHeight, rowHeight, selectedRow, layout.placements, onSelect, scrollRowIntoView],
  );

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS,
  );
  const windowTop = startRow * rowHeight;
  const windowHeight = Math.max(endRow - startRow, 1) * rowHeight;

  const xOf = (lane: number) => lane * laneWidth + laneWidth / 2;
  const yOf = (row: number) => (row - startRow) * rowHeight + rowHeight / 2;

  const nearEnd = rowCount > 0 && endRow >= rowCount - OVERSCAN_ROWS;
  useEffect(() => {
    if (nearEnd) onNearEnd?.();
  }, [nearEnd, rowCount, onNearEnd]);

  const visiblePlacements = layout.placements.slice(startRow, endRow);
  const visibleEdges = layout.edges.filter(
    (edge) => edge.fromRow < endRow && edge.toRow >= startRow,
  );
  const visibleOpenEdges = layout.openEdges.filter(
    (edge) => edge.fromRow >= startRow && edge.fromRow < endRow,
  );

  const nodeRadius = Math.max(3.5, 4.5 * zoom);
  const edgeWidth = Math.max(1.25, 1.75 * zoom);

  // Sticky badges (variant B): a branch whose tip scrolled off the top keeps
  // its name pinned to its lane at the top edge while the line is in view.
  const pinned = pinnedLines(lines, scrollTop / rowHeight)
    .map((line) => ({
      line,
      start: xOf(line.lane) + 6,
      width: estimateBadgeWidth(line.name) + 14, // the ↑ glyph
    }))
    .sort((a, b) => a.start - b.start);
  const shelves = packShelves(pinned);

  return (
    <div className={styles.root}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="listbox"
        aria-label={`Commit graph, ${rowCount} commits`}
        aria-activedescendant={selectedSha ? `gv-${selectedSha}` : undefined}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        {pinned.length > 0 && (
          // Sticky badges: redundant with the real ref rows (which stay the
          // accessible source of truth), so the overlay is aria-hidden;
          // clicking a badge jumps to that branch's tip.
          <div className={styles.pinned} aria-hidden="true">
            {pinned.map(({ line, start }, i) =>
              shelves[i]! >= 0 ? (
                <span
                  key={`${line.name}@${line.tipRow}`}
                  className={styles.pinnedBadge}
                  data-pinned={line.name}
                  data-source={line.source}
                  style={{
                    left: start,
                    top: shelves[i]! * SHELF_HEIGHT + 6,
                    color: laneColor(line.lane),
                    borderColor: laneColor(line.lane),
                  }}
                  title={`${line.name} — jump to the tip`}
                  onClick={() => scrollToRow(line.tipRow)}
                >
                  ↑ {line.name}
                </span>
              ) : null,
            )}
          </div>
        )}
        <div className={styles.canvas} style={{ height: totalHeight }}>
          <svg
            className={styles.edges}
            style={{ top: windowTop }}
            width={graphWidth}
            height={windowHeight}
            aria-hidden="true"
          >
            {visibleEdges.map((edge) => (
              <path
                key={`${edge.fromSha}-${edge.toSha}`}
                d={edgePath(
                  xOf(edge.fromLane),
                  yOf(edge.fromRow),
                  xOf(edge.viaLane),
                  xOf(edge.toLane),
                  yOf(edge.toRow),
                  rowHeight,
                )}
                fill="none"
                stroke={laneColor(edge.viaLane)}
                strokeWidth={edgeWidth}
                strokeLinecap="round"
              />
            ))}
            {visibleOpenEdges.map((edge) => (
              <line
                key={`${edge.fromSha}-${edge.toSha}`}
                x1={xOf(edge.fromLane)}
                y1={yOf(edge.fromRow)}
                x2={xOf(edge.fromLane)}
                y2={yOf(edge.fromRow) + rowHeight * 0.75}
                stroke={laneColor(edge.fromLane)}
                strokeWidth={edgeWidth}
                strokeDasharray="2 5"
                strokeLinecap="round"
                opacity={0.55}
              />
            ))}
            {visiblePlacements.map((placed) => {
              const isMerge = (commitsBySha.get(placed.sha)?.parents.length ?? 0) > 1;
              return (
                <circle
                  key={placed.sha}
                  cx={xOf(placed.lane)}
                  cy={yOf(placed.row)}
                  r={nodeRadius}
                  fill={isMerge ? "var(--bg-elevated)" : laneColor(placed.lane)}
                  stroke={laneColor(placed.lane)}
                  strokeWidth={isMerge ? 2 : 0}
                />
              );
            })}
          </svg>
          {visiblePlacements.map((placed) => {
            const commit = commitsBySha.get(placed.sha);
            const labels = labelsBySha.get(placed.sha);
            const refsLeft = xOf(placed.lane) + nodeRadius + 6;
            // Estimated badge row width so the message starts clear of the badges.
            const refsWidth = labels
              ? labels.reduce(
                  (width, label) => width + estimateBadgeWidth(label.name),
                  (labels.length - 1) * 4,
                )
              : 0;
            const padLeft = Math.max(graphWidth + 8, labels ? refsLeft + refsWidth + 8 : 0);
            return (
              <div
                key={placed.sha}
                id={`gv-${placed.sha}`}
                role="option"
                aria-selected={placed.sha === selectedSha}
                aria-posinset={placed.row + 1}
                aria-setsize={rowCount}
                className={styles.row}
                style={{ top: placed.row * rowHeight, height: rowHeight, paddingLeft: padLeft }}
                onClick={() => onSelect?.(placed.sha === selectedSha ? null : placed.sha)}
              >
                {labels && (
                  <span className={styles.refs} style={{ left: refsLeft }}>
                    {labels.map((label) => {
                      const role = label.type === "branch" ? branchRole(label.name) : undefined;
                      const color = laneColor(placed.lane);
                      // Branch badges wear their lane's color so label and
                      // line read as one thing; long-term branches fill the
                      // pill so the anchors stand out (main is always lane 0,
                      // so its color is fixed by construction). Merged-branch
                      // names (recovered from merge messages) are quiet
                      // annotations, not pills.
                      const identity =
                        label.type === "tag"
                          ? undefined
                          : role
                            ? { background: color, borderColor: color, color: "var(--on-accent)" }
                            : { color, borderColor: color };
                      return (
                        <span
                          key={label.name}
                          className={styles.badge}
                          data-ref-type={label.type}
                          data-branch-role={role}
                          title={label.name}
                          style={identity}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                  </span>
                )}
                <span className={styles.message}>{commit?.message}</span>
                <span className={styles.meta}>
                  {placed.sha.slice(0, 7)}
                  <span className={styles.byline}>
                    {" "}
                    · {commit?.author} · {commit?.date.slice(0, 10)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.zoomControls}>
        <button
          type="button"
          className={styles.zoomButton}
          aria-label="Zoom out"
          onClick={() => setZoomAnchored(zoomRef.current / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className={`${styles.zoomButton} ${styles.zoomReadout}`}
          aria-label="Reset zoom"
          onClick={() => setZoomAnchored(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          aria-label="Zoom in"
          onClick={() => setZoomAnchored(zoomRef.current * ZOOM_STEP)}
        >
          +
        </button>
      </div>
    </div>
  );
}
