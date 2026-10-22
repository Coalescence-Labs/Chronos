# Product — Chronos

## The promise

> Glance at Chronos and immediately understand the shape of a repo.

Who branched from where. What's merged. What's diverged. What's stale. What's active. No mental compilation required.

## The core tension we're solving

Git history tools cluster at two bad extremes:

- **Powerful but overwhelming** — dense, jargon-heavy, a wall of refs and SHAs. (Much of GitLens lands here for newcomers: too many surfaces, too much to learn.)
- **Pretty but shallow** — nice to look at, but you can't actually answer "what happened on this branch?"

Chronos targets the third corner: **high information density at low cognitive load.** That phrase is the product's north star. When in doubt, optimize for *understanding per glance*.

## Inspiration: Bitbucket, improved

Bitbucket's branch graph is the closest existing thing to what we want — clean lanes, readable merges, a real sense of structure. It is the reference point, *not* the ceiling. Where Bitbucket is cramped, slow on big repos, or ambiguous about branch relationships, Chronos should be better.

## Who it's for

Anyone with a repo, regardless of git fluency:
- A developer trying to remember what a teammate did last sprint.
- A newcomer onboarding to an unfamiliar project.
- A lead reviewing how a release came together.
- A curious person inspecting a public open-source project.

Approachability is a feature. Zero setup to view a public repo. One click to link GitHub.

## Product principles

1. **Understanding per glance.** Every pixel should buy comprehension. Prefer showing structure over showing data.
2. **Progressive depth.** Glanceable by default; rich on inspection. Detail appears when you ask for it (hover, tap, expand), never before.
3. **Calm, not noisy.** Motion and color carry meaning, not decoration. The graph should feel alive but never busy. (See [DESIGN.md](DESIGN.md).)
4. **Phone-equal.** The phone experience is first-class, not a shrunk-down desktop. People inspect repos from their couch.
5. **Privacy is a promise.** Viewing a repo should never quietly cost the user their data. (See [PRIVACY.md](PRIVACY.md).)
6. **Free and open.** A free hosted instance for everyone; the source is open so anyone can self-host or audit.

## What "AI" means here

**Beta (ratified):** **Graph Q&A** — opt-in natural-language questions over history already loaded in the browser (Chronos Agent). Public repos only until written ZDR. Infra: [AI.md](AI.md); privacy: [PRIVACY.md](PRIVACY.md).

**Still open (do not invent):** Agent UX chrome (exploration directions A–E are draft, not ratified — reject defaulting to 2025 chat UI); generative / graph-native answer UI as a future ambition; any AI job beyond Graph Q&A beta. Written ZDR for private-repo / production hardening remains open (#5).

Whatever ships next must (a) reduce cognitive load, not add a chatbot for its own sake, (b) be opt-in, and (c) move toward ZDR (mandatory outside the public-only beta carve-out).

## Out of scope (for now)

- Being a full git client (committing, rebasing, conflict resolution). Chronos *visualizes and inspects*; it doesn't replace your git workflow.
- Hosting repos. Chronos reads them; it isn't a forge.
