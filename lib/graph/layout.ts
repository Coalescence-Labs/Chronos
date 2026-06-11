import type { CommitNode, RepoHistory } from "./types";

/**
 * Hybrid lane layout (decision #1, docs/ARCHITECTURE.md): topological order
 * with date tie-breaking, stable columns for branches while they live,
 * compact reuse of freed lanes, and a hard column cap so the graph stays
 * readable on phones. Pure — no DOM, no network (tests/boundaries.test.ts).
 *
 * Tuning parameters (per the decision, defaults are deliberate but not
 * sacred): the cap value, and lane reuse picking the lowest free column.
 */

export interface PlacedCommit {
  sha: string;
  /** Vertical position, 0 = newest. */
  row: number;
  /** Horizontal lane (column), clamped to maxLanes - 1. */
  lane: number;
}

export type EdgeKind = "parent" | "merge";

/** A drawable child→parent connection between two placed commits. */
export interface GraphEdge {
  fromSha: string;
  toSha: string;
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  /** Lane the edge travels in between its endpoints. */
  viaLane: number;
  kind: EdgeKind;
}

/**
 * A child→parent link whose parent isn't loaded yet (progressive loading /
 * truncation). Rendered as a fading stub, completed when backfill arrives.
 */
export interface OpenEdge {
  fromSha: string;
  toSha: string;
  fromRow: number;
  fromLane: number;
  kind: EdgeKind;
}

export interface GraphLayout {
  /** One placement per commit, ordered by row. */
  placements: PlacedCommit[];
  edges: GraphEdge[];
  openEdges: OpenEdge[];
  laneCount: number;
}

export interface LayoutOptions {
  /** Hard column cap (decision #1). Lanes beyond it collapse into the last column. */
  maxLanes?: number;
}

export const DEFAULT_MAX_LANES = 12;

interface OrderEntry {
  commit: CommitNode;
  time: number;
  index: number;
}

/** True when a should be ordered before b: newer first, input order as tie-break. */
function ordersBefore(a: OrderEntry, b: OrderEntry): boolean {
  return a.time !== b.time ? a.time > b.time : a.index < b.index;
}

class OrderHeap {
  private items: OrderEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: OrderEntry): void {
    const items = this.items;
    items.push(entry);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!ordersBefore(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  pop(): OrderEntry {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let next = i;
        if (left < items.length && ordersBefore(items[left]!, items[next]!)) next = left;
        if (right < items.length && ordersBefore(items[right]!, items[next]!)) next = right;
        if (next === i) break;
        [items[i], items[next]] = [items[next]!, items[i]!];
        i = next;
      }
    }
    return top;
  }
}

/**
 * Topological order, children before parents, preferring newer author dates
 * among the commits that are ready. Tolerates clock skew (a parent dated
 * after its child still lands below it) and partially loaded histories.
 */
function topoOrder(commits: CommitNode[]): CommitNode[] {
  const deduped: CommitNode[] = [];
  const indexOf = new Map<string, number>();
  for (const commit of commits) {
    if (indexOf.has(commit.sha)) continue;
    indexOf.set(commit.sha, deduped.length);
    deduped.push(commit);
  }

  const pendingChildren = new Map<string, number>();
  for (const commit of deduped) {
    for (const parent of commit.parents) {
      if (indexOf.has(parent)) {
        pendingChildren.set(parent, (pendingChildren.get(parent) ?? 0) + 1);
      }
    }
  }

  const entry = (commit: CommitNode, index: number): OrderEntry => {
    const time = Date.parse(commit.date);
    return { commit, time: Number.isNaN(time) ? 0 : time, index };
  };

  const heap = new OrderHeap();
  for (const [index, commit] of deduped.entries()) {
    if (!pendingChildren.has(commit.sha)) heap.push(entry(commit, index));
  }

  const ordered: CommitNode[] = [];
  while (heap.size > 0) {
    const { commit } = heap.pop();
    ordered.push(commit);
    for (const parent of commit.parents) {
      const index = indexOf.get(parent);
      if (index === undefined) continue;
      const left = pendingChildren.get(parent)! - 1;
      if (left === 0) {
        pendingChildren.delete(parent);
        heap.push(entry(deduped[index]!, index));
      } else {
        pendingChildren.set(parent, left);
      }
    }
  }

  // Defensive: a parent cycle (impossible in real git, but this data crossed
  // the network) would strand commits — append them rather than drop them.
  if (ordered.length < deduped.length) {
    const seen = new Set(ordered.map((commit) => commit.sha));
    for (const commit of deduped) {
      if (!seen.has(commit.sha)) ordered.push(commit);
    }
  }
  return ordered;
}

interface PendingEdge {
  fromSha: string;
  toSha: string;
  fromRow: number;
  fromLane: number;
  viaLane: number;
  kind: EdgeKind;
}

export function layoutGraph(history: RepoHistory, options: LayoutOptions = {}): GraphLayout {
  const maxLanes = Math.max(1, options.maxLanes ?? DEFAULT_MAX_LANES);
  const clamp = (lane: number) => Math.min(lane, maxLanes - 1);

  const ordered = topoOrder(history.commits);
  const loaded = new Set(ordered.map((commit) => commit.sha));

  // active[i] = sha that lane i's running edge is waiting to meet.
  const active: (string | null)[] = [];
  // Reserve lane 0 for the default branch so the trunk reads as the spine
  // even when a side branch holds the newest commit.
  const head = history.refs.find((ref) => ref.type === "head");
  if (head && loaded.has(head.sha)) active.push(head.sha);

  const allocate = (): number => {
    const free = active.indexOf(null);
    if (free !== -1) return free;
    active.push(null);
    return active.length - 1;
  };

  const placements: PlacedCommit[] = [];
  const edges: GraphEdge[] = [];
  const openEdges: OpenEdge[] = [];
  const pendingByParent = new Map<string, PendingEdge[]>();
  let lanesUsed = 0;

  for (const [row, commit] of ordered.entries()) {
    // Lanes whose running edges end at this commit; the lowest becomes its column.
    const expecting: number[] = [];
    for (let i = 0; i < active.length; i++) {
      if (active[i] === commit.sha) expecting.push(i);
    }
    const lane = expecting.length > 0 ? expecting[0]! : allocate();
    for (const i of expecting) active[i] = null;
    lanesUsed = Math.max(lanesUsed, lane + 1);
    placements.push({ sha: commit.sha, row, lane: clamp(lane) });

    const waiting = pendingByParent.get(commit.sha);
    if (waiting) {
      for (const pending of waiting) {
        edges.push({ ...pending, toRow: row, toLane: clamp(lane) });
      }
      pendingByParent.delete(commit.sha);
    }

    for (const [parentIndex, parentSha] of commit.parents.entries()) {
      const kind: EdgeKind = parentIndex === 0 ? "parent" : "merge";
      if (!loaded.has(parentSha)) {
        openEdges.push({ fromSha: commit.sha, toSha: parentSha, fromRow: row, fromLane: clamp(lane), kind });
        continue;
      }
      let via: number;
      if (kind === "parent") {
        via = lane; // first parent keeps this commit's column alive
      } else {
        const existing = active.indexOf(parentSha);
        via = existing !== -1 ? existing : allocate();
      }
      active[via] = parentSha;
      lanesUsed = Math.max(lanesUsed, via + 1);
      const pending: PendingEdge = {
        fromSha: commit.sha,
        toSha: parentSha,
        fromRow: row,
        fromLane: clamp(lane),
        viaLane: clamp(via),
        kind,
      };
      const list = pendingByParent.get(parentSha);
      if (list) list.push(pending);
      else pendingByParent.set(parentSha, [pending]);
    }
  }

  return { placements, edges, openEdges, laneCount: Math.min(lanesUsed, maxLanes) };
}
