---
name: privacy-preflight
description: Mandatory guardrail to run BEFORE adding any AI feature or any new path that sends user/repo data off the user's device or off our server. Forces naming the data, destination, retention terms, and consent surface. Use whenever a change introduces data egress, calls an AI/LLM provider, adds an external API call with user/repo data, requests new OAuth scopes, or adds logging/telemetry of user content.
---

# Privacy pre-flight

Privacy is a core promise of Chronos (see `docs/PRIVACY.md`). This checklist runs **before** code that could leak data ships. It is short on purpose — the point is to make every egress path *deliberate and documented*, never accidental.

## When this is required

Run it if your change does any of:
- Calls an AI/LLM provider, or sends any data to one.
- Adds or changes a path that sends **user or repo data** off the user's device or off our server (new external API call, webhook, analytics/telemetry, error reporting that includes user content, etc.).
- Requests new **GitHub OAuth scopes** or stores more token/user data.
- Adds logging that could capture repo content, commit messages, tokens, or PII.

If your change does none of these, you don't need this skill.

## The checklist

Answer all of these in your PR description / output. If you can't answer one, stop and resolve it first.

1. **What data leaves?** Name the exact fields (e.g. "last 50 commit messages + branch names"). Not "context" — the actual data.
2. **Where does it go?** Name the destination (provider, endpoint, our server, third party).
3. **Is it the minimum?** Could the feature work with less? If yes, cut it down. Default to the smallest payload that does the job.
4. **Retention & training?** What does the destination do with it? For AI: is there a **written ZDR guarantee** (no retention, no training)? Link it. No written ZDR → do not ship.
5. **Consent.** Is this **opt-in**? Does the UI clearly tell the user what is sent off-device before it happens?
6. **Least privilege.** If new OAuth scopes: are they read-only and minimal? (Chronos never needs write scopes.)
7. **Secrets.** Confirm no tokens/secrets in the client bundle, logs, or the outbound payload.
8. **Untrusted input.** Repo content (commit messages, names) is untrusted — confirm it's sanitized before render and not used to construct unsafe requests.

## Output

Add a short **"Privacy pre-flight"** block to your PR/output capturing answers to 1–5 at minimum, and update `docs/PRIVACY.md` if this introduces a new, lasting data-flow category. If this change resolves open decision #3 or #5 in `docs/ARCHITECTURE.md`, move the resolution into the docs and remove it from the open list.

## If anything fails

Stop. A privacy regression is not a "fix later" — it breaks the core promise. Escalate to the owner rather than shipping a weaker privacy posture for convenience.
