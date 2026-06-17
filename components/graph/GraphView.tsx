"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { attributeBranches, packShelves, pinnedLines } from "@/lib/graph";
import type { Capsule, EdgeKind, GraphLayout, RepoHistory } from "@/lib/graph";
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
  /** Glance-mode capsules (COA-75), keyed by tip sha — drawn as folded pills. */
  capsules?: Map<string, Capsule>;
  /** True briefly while a Glance toggle restructures the graph: edges fade so
   *  they reform instead of snapping while nodes/rows glide to new positions. */
  reflowing?: boolean;
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
  capsules,
  reflowing = false,
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

  const commitsBySha = useMemo(
    () => new Map(history.commits.map((commit) => [commit.sha, commit])),
    [history.commits],
  );
  const { lines, lineBySha } = useMemo(
    () => attributeBranches(history, layout),
    [history, layout],
  );

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

  // Branch trace (COA-84): the selected commit's line is highlighted while
  // everything else dims, so one branch can be followed through a busy graph.
  // everything else dims. Trace is its own state (a branch tip), separate
  // from commit selection: tapping the graph/lane side of a row or a branch
  // badge highlights the branch; tapping the message/hash side opens the
  // commit. Being the single highlight source (no fallback to selection)
  // keeps toggling clean — untoggling never resurrects a stale line.
  const [tracedTip, setTracedTip] = useState<string | null>(null);
  const tracedLine = useMemo(
    () => (tracedTip ? (lineBySha.get(tracedTip) ?? null) : null),
    [tracedTip, lineBySha],
  );
  const tracedShas = useMemo(() => {
    if (!tracedLine) return null;
    const shas = new Set<string>();
    for (const [sha, line] of lineBySha) if (line === tracedLine) shas.add(sha);
    return shas;
  }, [tracedLine, lineBySha]);
  const isDimmed = (sha: string) => tracedShas !== null && !tracedShas.has(sha);
  // Edge ownership: first-parent edges belong to the child's line; merge
  // edges (and the fork-point join) belong to the merged branch's line.
  const edgeDimmed = (fromSha: string, toSha: string, kind: EdgeKind) =>
    tracedLine !== null && lineBySha.get(kind === "merge" ? toSha : fromSha) !== tracedLine;

  // Trace the line a commit belongs to (toggle); used by the graph/lane side
  // of a row and by branch badges. No-op for commits on no named line.
  const traceCommit = useCallback(
    (sha: string) => {
      const tip = lineBySha.get(sha)?.tipSha;
      if (tip) setTracedTip((prev) => (prev === tip ? null : tip));
    },
    [lineBySha],
  );
  const toggleTrace = useCallback((tip: string) => {
    setTracedTip((prev) => (prev === tip ? null : tip));
  }, []);

  // Long-press peeks the full (otherwise-ellipsized) subject inline, without
  // opening the commit view — useful on phones where subjects truncate. The
  // expanded row grows and pushes the rows/nodes below it down (real reflow),
  // so `expandedExtra` (measured) feeds the row→y mapping used by both layers.
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const expandedRow = useMemo(
    () => (expandedSha ? layout.placements.findIndex((p) => p.sha === expandedSha) : -1),
    [expandedSha, layout.placements],
  );
  // Callback ref on the expanded row measures its grown height in the commit
  // phase (before paint, no flash) — not a layout effect, so no setState-in-
  // effect cascade. The subject font doesn't scale with zoom, so the measured
  // height stays valid; the px gap below is derived against the live rowHeight.
  const measureExpanded = useCallback((el: HTMLDivElement | null) => {
    if (el) setMeasuredHeight(el.offsetHeight);
  }, []);
  const expandedExtra = expandedRow >= 0 ? Math.max(0, measuredHeight - rowHeight) : 0;

  const clearAll = useCallback(() => {
    setTracedTip(null);
    setExpandedSha(null);
    onSelect?.(null);
  }, [onSelect]);

  const pressTimer = useRef(0);
  const pressOrigin = useRef<{ x: number; y: number; sha: string } | null>(null);
  const suppressClick = useRef(false);

  const startPress = useCallback((sha: string, event: React.PointerEvent) => {
    pressOrigin.current = { x: event.clientX, y: event.clientY, sha };
    suppressClick.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true; // swallow the click that follows the press
      setExpandedSha((prev) => (prev === sha ? null : sha));
    }, 450);
  }, []);
  const movePress = useCallback((event: React.PointerEvent) => {
    const origin = pressOrigin.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) {
      clearTimeout(pressTimer.current);
    }
  }, []);
  const endPress = useCallback(() => clearTimeout(pressTimer.current), []);
  useEffect(() => () => clearTimeout(pressTimer.current), []);

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

  // Escape clears trace/selection/peek from anywhere, not just when the graph
  // is focused (you trace a branch, then reach for Escape without clicking in).
  useEffect(() => {
    if (!selectedSha && !tracedTip && !expandedSha) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTracedTip(null);
      setExpandedSha(null);
      onSelect?.(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedSha, tracedTip, expandedSha, onSelect]);

  const handleScroll = useCallback(() => {
    setExpandedSha(null); // a peek doesn't follow the scroll — collapse it
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
        clearAll();
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
    [rowCount, viewportHeight, rowHeight, selectedRow, layout.placements, onSelect, scrollRowIntoView, clearAll],
  );

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS,
  );
  // An expanded (long-press) row adds `expandedExtra` px; rows and graph nodes
  // below it shift down by that, so both layers reflow together.
  const offsetBelow = (row: number) =>
    expandedRow >= 0 && row > expandedRow ? expandedExtra : 0;
  const rowTop = (row: number) => row * rowHeight + offsetBelow(row);
  const totalHeight = Math.max(
    rowCount * rowHeight + (expandedRow >= 0 ? expandedExtra : 0),
    rowHeight,
  );
  const windowTop = rowTop(startRow);
  const windowHeight = Math.max(rowTop(endRow) - windowTop, rowHeight);

  const xOf = (lane: number) => lane * laneWidth + laneWidth / 2;
  const yOf = (row: number) => rowTop(row) - windowTop + rowHeight / 2;

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
        // Clicking empty graph space (rows and badges stopPropagation) clears
        // the selection/trace back to the default view.
        onClick={() => clearAll()}
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
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect?.(line.tipSha);
                    scrollToRow(line.tipRow);
                  }}
                >
                  ↑ {line.name}
                </span>
              ) : null,
            )}
          </div>
        )}
        <div
          className={`${styles.canvas}${reflowing ? ` ${styles.reflowing}` : ""}`}
          style={{ height: totalHeight }}
        >
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
                opacity={reflowing ? 0 : edgeDimmed(edge.fromSha, edge.toSha, edge.kind) ? 0.12 : 1}
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
                opacity={reflowing ? 0 : isDimmed(edge.fromSha) ? 0.1 : 0.55}
              />
            ))}
            {visiblePlacements.map((placed) => {
              // Glance capsule: a folded branch — draw a stadium pill, not a
              // node, so it reads as "several commits collapsed here".
              if (capsules?.has(placed.sha)) {
                const w = nodeRadius * 3.2;
                const h = nodeRadius * 2;
                return (
                  <rect
                    key={placed.sha}
                    className={styles.node}
                    x={xOf(placed.lane) - w / 2}
                    y={yOf(placed.row) - h / 2}
                    width={w}
                    height={h}
                    rx={h / 2}
                    fill="var(--bg-elevated)"
                    stroke={laneColor(placed.lane)}
                    strokeWidth={2}
                    strokeDasharray="3 2"
                    opacity={isDimmed(placed.sha) ? 0.18 : 1}
                    style={{ transform: placed.sha === selectedSha ? "scale(1.3)" : undefined }}
                  />
                );
              }
              const isMerge = (commitsBySha.get(placed.sha)?.parents.length ?? 0) > 1;
              return (
                <circle
                  key={placed.sha}
                  className={styles.node}
                  cx={xOf(placed.lane)}
                  cy={yOf(placed.row)}
                  r={nodeRadius}
                  fill={isMerge ? "var(--bg-elevated)" : laneColor(placed.lane)}
                  stroke={laneColor(placed.lane)}
                  strokeWidth={isMerge ? 2 : 0}
                  opacity={isDimmed(placed.sha) ? 0.18 : 1}
                  style={{ transform: placed.sha === selectedSha ? "scale(1.6)" : undefined }}
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
                ref={placed.sha === expandedSha ? measureExpanded : undefined}
                role="option"
                aria-selected={placed.sha === selectedSha}
                aria-posinset={placed.row + 1}
                aria-setsize={rowCount}
                className={`${styles.row}${placed.sha === expandedSha ? ` ${styles.expanded}` : ""}`}
                data-dimmed={isDimmed(placed.sha) || undefined}
                data-expanded={placed.sha === expandedSha || undefined}
                style={{
                  top: rowTop(placed.row),
                  height: placed.sha === expandedSha ? undefined : rowHeight,
                  minHeight: rowHeight,
                  paddingLeft: padLeft,
                }}
                onPointerDown={(event) => startPress(placed.sha, event)}
                onPointerMove={movePress}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onContextMenu={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (suppressClick.current) {
                    suppressClick.current = false; // this click ended a long-press
                    return;
                  }
                  // A normal click while a peek is open collapses it first
                  // (clicking any other commit/branch dismisses the expansion).
                  if (expandedSha) setExpandedSha(null);
                  // Graph/lane side highlights the branch; the message/hash
                  // side opens the commit (touch-friendly split, COA mobile).
                  const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
                  if (x < padLeft) traceCommit(placed.sha);
                  else onSelect?.(placed.sha === selectedSha ? null : placed.sha);
                }}
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
                      // Tags are point markers; branch/merged labels name a
                      // line, so clicking one traces it (COA-84).
                      if (label.type === "tag") {
                        return (
                          <span
                            key={label.name}
                            className={styles.badge}
                            data-ref-type={label.type}
                            title={label.name}
                          >
                            {label.name}
                          </span>
                        );
                      }
                      const traced = tracedLine?.tipSha === placed.sha;
                      return (
                        <button
                          key={label.name}
                          type="button"
                          className={styles.badge}
                          data-ref-type={label.type}
                          data-branch-role={role}
                          data-traced={traced || undefined}
                          title={traced ? `${label.name} — clear trace` : `Trace ${label.name}`}
                          aria-label={traced ? `Clear trace of ${label.name}` : `Trace ${label.name}`}
                          aria-pressed={traced}
                          style={identity}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleTrace(placed.sha);
                          }}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </span>
                )}
                {capsules?.has(placed.sha) && (
                  <span className={styles.capsuleCount}>
                    {capsules.get(placed.sha)!.commitCount} commits
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
