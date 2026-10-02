# CLAUDE.md — Chronos

This is the entry point for Claude Code (and other agents) working in the Chronos repo. It is intentionally thin: it points at the canonical docs so there is **one source of truth**.

## Read these first

1. **[AGENTS.md](AGENTS.md)** — the operating manual: conventions, Linear backbone, runtime, file map, do/don't. **Always read this.**
2. **[docs/PRODUCT.md](docs/PRODUCT.md)** — what we're building and why.
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how it's built + **open decisions** (do not invent answers to these).
4. **[docs/DESIGN.md](docs/DESIGN.md)** — the visual bar.
5. **[docs/PRIVACY.md](docs/PRIVACY.md)** — non-negotiable privacy/ZDR rules.

## Project backbone

**Linear** (team Coalescence Labs / project Chronos) tracks all work. Find or create a ticket before starting; keep status and comments current; link PRs. Details in [AGENTS.md](AGENTS.md) §3. Cursor agents also load [`.cursor/rules/linear-backbone.mdc`](.cursor/rules/linear-backbone.mdc).

## The one rule that overrides convenience

Privacy is a product promise, not a feature. **Before adding any AI feature or any new path that sends user/repo data off the user's machine or our server, run the privacy pre-flight skill** (`.claude/skills/privacy-preflight/`). No exceptions.

## Runtime

Bun everywhere — `bun`, `bun run`, `bun test`. Never `npm`/`yarn`/`node`/`ts-node`.
