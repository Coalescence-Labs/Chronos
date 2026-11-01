import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGitArgv, gitEnv, gitMcpConfig, runGit, type GitMcpConfig } from "@/lib/mcp/git";
import { handleMcpRequest } from "@/lib/mcp/protocol";

const TOKEN = "t".repeat(40);
let root = "";
let env: Record<string, string | undefined> = {};
let config: GitMcpConfig;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "chronos-mcp-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env: { ...process.env, HOME: root, GIT_CONFIG_NOSYSTEM: "1" } });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(root, "a.txt"), "secret content\n");
  git("add", "a.txt");
  git("commit", "-q", "-m", "first");
  env = { PATH: process.env.PATH, HOME: root, CHRONOS_MCP_TOKEN: TOKEN, CHRONOS_MCP_REPOS: `fixture=${root}`, GITHUB_APP_PRIVATE_KEY: "must-not-leak" };
  config = gitMcpConfig(env)!;
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  handleMcpRequest(new Request("http://localhost:3005/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }), env);

describe("git MCP config", () => {
  test("is off without a long token and an absolute repository map", () => {
    expect(gitMcpConfig({})).toBeNull();
    expect(gitMcpConfig({ CHRONOS_MCP_TOKEN: "short", CHRONOS_MCP_REPOS: `x=${root}` })).toBeNull();
    expect(gitMcpConfig({ CHRONOS_MCP_TOKEN: TOKEN, CHRONOS_MCP_REPOS: "x=relative/path" })).toBeNull();
    expect(gitMcpConfig({ CHRONOS_MCP_TOKEN: TOKEN, CHRONOS_MCP_REPOS: `x=${root}` })?.allowContent).toBe(false);
  });
});

describe("git allowlist", () => {
  test("accepts the owner's examples", () => {
    expect(() => buildGitArgv("status", ["--short", "--branch"], false)).not.toThrow();
    expect(() => buildGitArgv("log", ["--graph", "--decorate", "--oneline", "-20", "--since=2.weeks"], false)).not.toThrow();
  });

  test.each([
    ["log", ["--output=/tmp/x"]],
    ["log", ["--outp=/tmp/x"]],
    ["log", ["-p"]],
    ["status", ["-c", "core.pager=sh"]],
    ["log", ["--exec-path=/tmp"]],
    ["log", ["--", "../outside"]],
    ["log", ["/etc/passwd"]],
    ["log", ["~/secrets"]],
    ["worktree", ["add", "x"]],
  ])("rejects git %s %p", (command, args) => {
    expect(() => buildGitArgv(command, args, true)).toThrow();
  });

  test("rejects write and unknown subcommands", () => {
    for (const command of ["commit", "push", "checkout", "reset", "config", "remote", "constructor"]) {
      expect(() => buildGitArgv(command, [], true)).toThrow();
    }
  });

  test("gates content commands", () => {
    expect(() => buildGitArgv("show", ["HEAD"], false)).toThrow(/file contents/);
    expect(() => buildGitArgv("diff", ["--stat"], true)).not.toThrow();
  });

  test("keeps branch and tag in list mode and disables external diff tools", () => {
    expect(buildGitArgv("branch", ["new-branch"], false)).toContain("--list");
    expect(buildGitArgv("log", [], false)).toContain("--no-ext-diff");
  });
});

describe("runGit", () => {
  test("reports HEAD, branch and exit code", async () => {
    const result = await runGit(config, { repo: "fixture", command: "log", args: ["--oneline"] }, env);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("first");
    expect(result.branch).toBe("main");
    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
    expect(result.truncated).toBe(false);
  });

  test("a positional branch argument never creates a branch", async () => {
    await runGit(config, { repo: "fixture", command: "branch", args: ["created-by-model"] }, env);
    expect(existsSync(join(root, ".git/refs/heads/created-by-model"))).toBe(false);
  });

  test("the child process does not inherit app secrets or git overrides", () => {
    const child = gitEnv({ ...env, GIT_DIR: "/elsewhere", GIT_PAGER: "sh" });
    expect(Object.keys(child).sort()).toEqual(["GIT_CONFIG_NOSYSTEM", "GIT_OPTIONAL_LOCKS", "GIT_TERMINAL_PROMPT", "HOME", "LC_ALL", "PATH"]);
  });

  test("rejects unknown repositories", async () => {
    await expect(runGit(config, { repo: "other", command: "status" }, env)).rejects.toThrow(/Unknown repository/);
  });
});

describe("MCP endpoint", () => {
  test("is absent when unconfigured and requires the bearer token", async () => {
    expect((await handleMcpRequest(new Request("http://x/api/mcp", { method: "POST" }), {})).status).toBe(404);
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { authorization: "Bearer wrong" })).status).toBe(401);
  });

  test("initializes, lists tools and runs git", async () => {
    const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

    const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_repositories", "git"]);

    const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "git", arguments: { repo: "fixture", command: "status", args: ["--short", "--branch"] } } })).json();
    expect(call.result.isError).toBe(false);
    expect(call.result.structuredContent.stdout).toContain("## main");
  });

  test("returns rejected commands as tool errors", async () => {
    const call = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "git", arguments: { repo: "fixture", command: "push" } } })).json();
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toContain("not allowed");
  });
});
