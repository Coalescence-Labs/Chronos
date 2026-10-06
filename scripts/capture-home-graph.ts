import { fileURLToPath } from "node:url";
import { BASE_LANE_WIDTH, BASE_ROW_HEIGHT, edgePath } from "../components/graph/geometry";
import { layoutGraph, type RepoHistory } from "../lib/graph";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT = new URL("../components/background/chronos-graph.json", import.meta.url);
const SOURCE = "refs/remotes/origin/main";
const COMMIT_LIMIT = 80;

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error("Cannot read Chronos history. Fetch origin/main before capturing the home graph.");
  }
  return result.stdout.toString().trim();
}

const origin = git("remote", "get-url", "origin");
if (!/^(?:git@github\.com:|https:\/\/github\.com\/)Coalescence-Labs\/Chronos(?:\.git)?$/i.test(origin)) {
  throw new Error("The home graph may only capture the Coalescence-Labs/Chronos origin.");
}

// Remote main only: never publish local branches, working-tree changes, or user repos.
const commits = git("log", SOURCE, "--topo-order", `--max-count=${COMMIT_LIMIT}`, "--format=%H%x09%P%x09%aI")
  .split("\n")
  .map((line) => {
    const [sha, parents, date] = line.split("\t");
    if (!sha || parents === undefined || !date) throw new Error("Invalid git history.");
    return { sha, parents: parents ? parents.split(" ") : [], date, author: "", message: "" };
  });

const history: RepoHistory = {
  commits,
  refs: [{ name: "HEAD", type: "head", sha: commits[0]!.sha }],
};
const layout = layoutGraph(history, { maxLanes: 8 });
const merges = new Set(commits.filter((commit) => commit.parents.length > 1).map((commit) => commit.sha));
const xOf = (lane: number) => lane * BASE_LANE_WIDTH + BASE_LANE_WIDTH / 2;
const yOf = (row: number) => (row + 0.5) * BASE_ROW_HEIGHT;

// Only geometry reaches disk; commit identifiers and dates stay in this process.
const snapshot = {
  width: layout.laneCount * BASE_LANE_WIDTH + BASE_LANE_WIDTH / 2,
  height: commits.length * BASE_ROW_HEIGHT,
  nodes: layout.placements.map((placed) => ({
    x: xOf(placed.lane),
    y: yOf(placed.row),
    lane: placed.lane,
    merge: merges.has(placed.sha),
  })),
  edges: layout.edges.map((edge) => ({
    d: edgePath(xOf(edge.fromLane), yOf(edge.fromRow), xOf(edge.viaLane), xOf(edge.toLane), yOf(edge.toRow), BASE_ROW_HEIGHT),
    lane: edge.viaLane,
  })),
};

await Bun.write(OUTPUT, `${JSON.stringify(snapshot)}\n`);
console.log(`Captured ${snapshot.nodes.length} commits into components/background/chronos-graph.json.`);
