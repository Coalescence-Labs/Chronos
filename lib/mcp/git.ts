import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

/**
 * Allowlisted, read-only git for the MCP endpoint (Reed in Organic). Commands run with argv
 * only (no shell) against repositories the owner names in CHRONOS_MCP_REPOS. Every flag must
 * match an exact token or a `--name=` prefix below: git accepts unambiguous abbreviations of
 * long options, so a blocklist (`--output`, `--no-index`) could be bypassed with `--outp=`.
 */

type Env = Record<string, string | undefined>;

export type GitRepo = { name: string; root: string };
export type GitMcpConfig = { token: string; repos: GitRepo[]; allowContent: boolean };
export type GitRunResult = {
  repo: string;
  command: string;
  head: string | null;
  branch: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
};

type Spec = {
  flags: readonly string[];
  /** `--name=` prefixes whose value is attached; never a separate token. */
  valued?: readonly string[];
  /** Token patterns such as `-20` or `-L10,20`. */
  patterns?: readonly RegExp[];
  positionals: boolean;
  /** Prints file contents, which only CHRONOS_MCP_ALLOW_CONTENT=true permits. */
  content?: boolean;
  /** Injected before user arguments. `--list` keeps branch/tag from creating refs. */
  fixed?: readonly string[];
};

const HISTORY_FLAGS = ["--all", "--branches", "--remotes", "--tags", "--first-parent", "--merges", "--no-merges", "--reverse", "--date-order", "--topo-order", "--ancestry-path", "--boundary", "--left-right", "--cherry-pick", "--simplify-by-decoration"];
const HISTORY_VALUED = ["--max-count=", "--skip=", "--since=", "--until=", "--after=", "--before=", "--author=", "--committer=", "--grep="];
const SUMMARY_FLAGS = ["--stat", "--shortstat", "--numstat", "--name-only", "--name-status", "--summary"];
const COUNT = /^-\d{1,5}$/;

export const GIT_COMMANDS: Record<string, Spec> = {
  status: { flags: ["--short", "-s", "--branch", "-b", "--porcelain", "--porcelain=v1", "--porcelain=v2", "--ahead-behind", "--no-ahead-behind", "-uno", "-unormal", "-uall"], positionals: true },
  log: {
    flags: [...HISTORY_FLAGS, ...SUMMARY_FLAGS, "--oneline", "--graph", "--decorate", "--decorate=short", "--decorate=full", "--no-decorate", "--abbrev-commit", "--no-abbrev-commit"],
    valued: [...HISTORY_VALUED, "--format=", "--pretty=", "--date=", "--decorate-refs=", "--decorate-refs-exclude="],
    patterns: [COUNT],
    positionals: true,
    fixed: ["--no-ext-diff", "--no-textconv"],
  },
  "rev-list": { flags: [...HISTORY_FLAGS, "--count", "--parents"], valued: HISTORY_VALUED, patterns: [COUNT], positionals: true },
  "rev-parse": { flags: ["--abbrev-ref", "--short", "--verify", "--symbolic-full-name", "--show-toplevel", "--is-inside-work-tree"], valued: ["--short="], positionals: true },
  "merge-base": { flags: ["--is-ancestor", "--all", "--octopus", "--fork-point", "--independent"], positionals: true },
  branch: {
    flags: ["-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--no-color"],
    valued: ["--merged=", "--no-merged=", "--contains=", "--no-contains=", "--points-at=", "--sort=", "--format="],
    positionals: true,
    fixed: ["--list"],
  },
  tag: { flags: ["-n"], valued: ["--merged=", "--no-merged=", "--contains=", "--no-contains=", "--points-at=", "--sort=", "--format="], positionals: true, fixed: ["--list"] },
  "for-each-ref": { flags: [], valued: ["--format=", "--sort=", "--count=", "--merged=", "--no-merged=", "--contains=", "--no-contains=", "--points-at="], positionals: true },
  describe: { flags: ["--tags", "--all", "--always", "--long", "--exact-match", "--contains", "--first-parent"], valued: ["--abbrev=", "--match=", "--exclude="], positionals: true },
  shortlog: { flags: ["-s", "-n", "-e", "--summary", "--numbered", "--email", "--all", "--no-merges"], valued: ["--since=", "--until=", "--max-count="], positionals: true },
  "ls-files": { flags: ["--cached", "--modified", "--deleted", "--others", "--exclude-standard", "--unmerged", "--directory"], positionals: true },
  worktree: { flags: ["--porcelain"], positionals: false, fixed: ["list"] },
  show: {
    flags: [...SUMMARY_FLAGS, "--oneline", "--no-patch", "-s", "--abbrev-commit", "--word-diff", "-w", "--ignore-all-space"],
    valued: ["--format=", "--pretty=", "--date="],
    patterns: [/^-U\d{1,3}$/],
    positionals: true,
    content: true,
    fixed: ["--no-ext-diff", "--no-textconv"],
  },
  diff: {
    flags: [...SUMMARY_FLAGS, "--cached", "--staged", "--merge-base", "--word-diff", "-w", "--ignore-all-space", "-M", "--find-renames"],
    patterns: [/^-U\d{1,3}$/],
    positionals: true,
    content: true,
    fixed: ["--no-ext-diff", "--no-textconv"],
  },
  blame: { flags: ["-w", "-s", "-e", "--porcelain", "--line-porcelain"], patterns: [/^-L\d{1,6},\+?\d{1,6}$/], positionals: true, content: true, fixed: ["--no-textconv"] },
  grep: { flags: ["-n", "-i", "-l", "-c", "-w", "-F", "-E", "--count", "--files-with-matches", "--line-number", "--ignore-case"], valued: ["--max-count="], positionals: true, content: true, fixed: ["--no-textconv"] },
};

/** Settings no repository config or pager may override for these runs. */
const GLOBAL_ARGS = ["--no-pager", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "core.pager=cat", "-c", "color.ui=never", "-c", "diff.external="];
const MAX_ARGS = 32;
const MAX_ARG_LENGTH = 512;
export const GIT_TIMEOUT_MS = 10_000;
export const GIT_OUTPUT_LIMIT = 64_000;

export class GitCommandError extends Error {}

/** Returns null unless both a token and at least one repository are configured. */
export function gitMcpConfig(env: Env = process.env): GitMcpConfig | null {
  const token = env.CHRONOS_MCP_TOKEN?.trim() ?? "";
  if (token.length < 32) return null;
  const repos: GitRepo[] = [];
  for (const entry of (env.CHRONOS_MCP_REPOS ?? "").split(",")) {
    const [name, root] = entry.split("=").map((part) => part?.trim() ?? "");
    if (!name || !root) continue;
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name) || !isAbsolute(root) || repos.some((r) => r.name === name)) return null;
    repos.push({ name, root });
  }
  return repos.length ? { token, repos, allowContent: env.CHRONOS_MCP_ALLOW_CONTENT === "true" } : null;
}

function isSafePositional(arg: string): boolean {
  return !arg.startsWith("-") && !arg.startsWith("~") && !isAbsolute(arg)
    && !/(^|[\\/])\.\.([\\/]|$)/.test(arg) && !/[\0\r\n]/.test(arg);
}

/** Validates against the allowlist and returns the full argv for `git`. */
export function buildGitArgv(command: string, args: readonly string[], allowContent: boolean): string[] {
  const spec = Object.hasOwn(GIT_COMMANDS, command) ? GIT_COMMANDS[command] : undefined;
  if (!spec) throw new GitCommandError(`git ${command} is not allowed. Allowed: ${Object.keys(GIT_COMMANDS).join(", ")}.`);
  if (spec.content && !allowContent) throw new GitCommandError(`git ${command} prints file contents, which this Chronos host does not share.`);
  if (args.length > MAX_ARGS) throw new GitCommandError(`At most ${MAX_ARGS} arguments.`);
  for (const arg of args) {
    if (typeof arg !== "string" || !arg || arg.length > MAX_ARG_LENGTH || /[\0\r\n]/.test(arg)) throw new GitCommandError("Arguments must be short, single-line strings.");
    if (arg === "--") continue;
    if (arg.startsWith("-")) {
      const known = spec.flags.includes(arg)
        || (spec.valued ?? []).some((prefix) => arg.startsWith(prefix) && arg.length > prefix.length)
        || (spec.patterns ?? []).some((pattern) => pattern.test(arg));
      if (!known) throw new GitCommandError(`Flag ${arg} is not allowed for git ${command}.`);
      continue;
    }
    if (!spec.positionals) throw new GitCommandError(`git ${command} takes no positional arguments.`);
    if (!isSafePositional(arg)) throw new GitCommandError(`Argument ${arg} must be a revision or a path inside the repository.`);
  }
  return [...GLOBAL_ARGS, command, ...(spec.fixed ?? []), ...args];
}

/** Child processes inherit nothing else: no app secrets, no GIT_DIR, no pager. */
export function gitEnv(env: Env): Env {
  return {
    PATH: env.PATH ?? "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin",
    HOME: env.HOME,
    LC_ALL: "C",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_NOSYSTEM: "1",
  };
}

type Spawned = { exitCode: number | null; stdout: string; stderr: string; truncated: boolean; timedOut: boolean };

function spawnGit(cwd: string, argv: string[], env: Env): Promise<Spawned> {
  return new Promise((resolve) => {
    const child = spawn("git", argv, { cwd, env: gitEnv(env) as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"], shell: false });
    const out = { stdout: "", stderr: "" };
    let truncated = false;
    let timedOut = false;
    const take = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const room = GIT_OUTPUT_LIMIT - out[stream].length;
      if (room <= 0) return;
      const text = chunk.toString("utf8");
      out[stream] += text.slice(0, room);
      if (text.length > room) {
        truncated = true;
        child.kill("SIGTERM");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, GIT_TIMEOUT_MS);
    child.stdout.on("data", take("stdout"));
    child.stderr.on("data", take("stderr"));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout: "", stderr: error.message, truncated, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, ...out, truncated, timedOut });
    });
  });
}

export function findRepo(config: GitMcpConfig, name: string): GitRepo {
  const repo = config.repos.find((r) => r.name === name);
  if (!repo) throw new GitCommandError(`Unknown repository ${name}. Configured: ${config.repos.map((r) => r.name).join(", ")}.`);
  return repo;
}

/** HEAD's SHA and branch, so every result names the state it describes. */
export async function repoHead(repo: GitRepo, env: Env = process.env): Promise<{ head: string | null; branch: string | null }> {
  const result = await spawnGit(repo.root, [...GLOBAL_ARGS, "rev-parse", "HEAD", "--abbrev-ref", "HEAD"], env);
  const [head, branch] = result.exitCode === 0 ? result.stdout.trim().split("\n") : [];
  return { head: head ?? null, branch: branch && branch !== "HEAD" ? branch : null };
}

export async function runGit(config: GitMcpConfig, input: { repo: string; command: string; args?: string[] }, env: Env = process.env): Promise<GitRunResult> {
  const repo = findRepo(config, input.repo);
  const args = input.args ?? [];
  const argv = buildGitArgv(input.command, args, config.allowContent);
  const [state, result] = await Promise.all([repoHead(repo, env), spawnGit(repo.root, argv, env)]);
  return { repo: repo.name, command: ["git", input.command, ...args].join(" "), ...state, ...result };
}
