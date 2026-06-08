# Chronos

**See your git history at a glance.** Chronos is a beautiful, fast git branch-graph visualizer for anyone who wants to understand what's happening in a repo without spelunking through `git log`.

> Status: 🌱 Greenfield. This repository currently contains the **agent backbone** — the docs, conventions, and guardrails that guide development. No application code exists yet.

---

## Why Chronos

Most git history tools force a trade-off: either they're powerful but overwhelming (looking at you, dense IDE blame views), or they're pretty but shallow. Chronos aims for the third corner:

> **High information density, low cognitive load.**

Inspired by the best parts of Bitbucket's branch graph — and unafraid to fix the parts that aren't great — Chronos lets you *glance* at a repo and immediately grok its shape: who branched from where, what's merged, what's diverged, what's stale.

## What it does (product goals)

- **View any repo's branch history** — paste a **public repo URL**, or **link your GitHub account** and pick a private repo.
- **Works everywhere** — a hosted web app that feels native on both **laptop and phone**. No install required.
- **Beautiful and polished** — an organic-futuristic design language; calm, powerful, intentional. The UI is a feature.
- **Privacy-first** — see [Privacy & Security](docs/PRIVACY.md). Optional AI features run under strict **Zero Data Retention (ZDR)** policies.
- **Free & open source** — a free hosted instance for everyone, and a repo you can self-host.

## Architecture at a glance

Chronos is **web-first** with a **native companion** planned for later:

| Tier | What | Status |
|------|------|--------|
| **Core** | Hosted Next.js web app on Vercel — public-URL viewing, GitHub OAuth, responsive PWA for phone + laptop | v1 target |
| **Companion** | A [`zero-native`](https://github.com/vercel-labs/zero-native) desktop shell that reuses the same web UI for a privacy-max **local mode** (reads `.git` directly, nothing uploaded) | Phase 2, additive |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture, including the **open decisions** that still need to be made.

## Documentation

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Operating manual for AI agents and contributors working in this repo |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Product vision and the "high info / low cognitive load" philosophy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture + open decisions |
| [docs/DESIGN.md](docs/DESIGN.md) | Visual language, responsiveness, and the polish bar |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Security, privacy, and the ZDR AI model |

## Tech stack

- **Runtime / package manager:** [Bun](https://bun.sh) (not npm/yarn/node)
- **Web app:** Next.js (React) — hosted on Vercel
- **Native companion (phase 2):** `zero-native` (Zig native shell + the same web UI)
- **AI (optional):** ZDR-compliant provider; feature surface TBD (see open decisions)

## Getting started

> ⚠️ No app scaffold exists yet. Once it does, this section will cover `bun install` and `bun run dev`. For now, start with [AGENTS.md](AGENTS.md) and the docs above.

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Coalescence Labs. Free to use, fork, self-host, and modify, with an explicit patent grant.
