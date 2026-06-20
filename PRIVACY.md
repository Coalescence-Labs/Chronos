# Privacy at Chronos

Chronos draws a beautiful picture of a git repo's history so you can understand it at a glance. To do that, it needs to read the repo — and that's the only thing it does with your data. Nothing is stored, nothing is logged, nothing is sold, and nothing is used to train AI.

This page explains, in plain language, exactly what happens to data when you use Chronos. If you want the binding engineering rules behind these promises, see [docs/PRIVACY.md](docs/PRIVACY.md).

---

## The short version

| Question | Answer |
|---|---|
| Do you store the repos I view? | **No.** Repo data passes through our server only to draw your graph, then it's gone. |
| Do you log commit messages, branch names, SHAs, or authors? | **No.** None of it is written to logs. |
| Do you train AI on my repo? | **No.** Never. |
| Do I need an account? | **No.** Paste a public repo URL and go. |
| Do you use tracking cookies? | **No.** Analytics is cookieless and anonymous. |
| Do your analytics record *which* repo I looked at? | **No.** Repo names are scrubbed out before anything is recorded. |
| Is it open source? | **Yes** — Apache 2.0. You can read or audit every line. |

---

## What Chronos does with repo data

When you ask Chronos to visualize a repo, it fetches the git history it needs to build the graph — commit relationships, branch tips, merges, dates, and the like — **through our server**, and sends the resulting picture back to your browser.

That trip through our server exists for one reason: to keep things secure (so any access token never touches the browser). While the data is in transit, three rules apply:

- **We never store it.** Repo content is held only long enough to answer your request, then discarded. There is no database of repos you've viewed.
- **We never log it.** Commit messages, branch names, SHAs, and author details are not written to our logs.
- **We never train on it.** Your repo is not training data for anything, full stop.

We also fetch the **minimum** needed to draw the graph — the structural git metadata — not your file contents or diffs.

---

## Public repos only (for now)

Today, Chronos works with **public repositories only**. We don't ask for access to private repos, and we don't request permission to write to anything — Chronos only ever *reads*.

If we ever add private-repo support, it will be a deliberate, clearly-disclosed change with its own privacy review — not something that happens quietly.

---

## Analytics: cookieless and anonymous

We measure a few things to make Chronos faster and easier to understand — for example, how quickly the first graph appears, or whether people find the inspection features. We do this with **privacy-respecting, cookieless analytics**:

- **No tracking cookies**, and no profile that follows you across days or across other websites.
- **No personal information** — no accounts, no names, no email, no IP-address tracking.
- **Repo names are scrubbed.** Because the address of a graph page contains the repo's owner and name, we strip that out *before* anything is recorded — so our analytics can tell us "someone viewed a repo," but never *which* repo. The details are in [docs/ANALYTICS.md](docs/ANALYTICS.md).
- We collect only anonymous, aggregate signals — counts, durations, and a fixed set of categories — never anything that could identify you or a specific repo.

If you'd rather send nothing at all, you can opt out in your own browser, and anyone self-hosting Chronos can turn analytics off entirely with a single setting.

---

## No accounts, no tracking

Viewing a public repo takes **zero setup** — no sign-up, no login, no profile. Linking a GitHub account (when you choose to) is read-only and uses the minimum permissions needed; the access token stays securely on our server and is never exposed to the browser.

There's no advertising, no third-party trackers, and no selling of data. There's nothing to sell, because we don't keep it.

---

## AI: optional, and only with Zero Data Retention

Chronos may add optional AI features later (for example, to summarize what happened on a branch). If and when it does, two promises hold:

- **It's opt-in.** AI is off until you turn it on, and we'll tell you clearly what gets sent where.
- **Zero Data Retention only.** We will only use an AI provider that contractually guarantees it stores nothing beyond answering the request and **does not train** on your data — and we send the minimum context needed, never your whole repo.

Until those conditions are met and reviewed, the feature doesn't ship.

---

## Open source and auditable

Chronos is free and open source under **Apache 2.0**. That's not just a license choice — it's what makes these privacy promises *checkable*. You don't have to take our word for it; you can read the code, see exactly what data flows where, or run your own instance.

---

## Want the technical detail?

This page is the friendly overview. The binding, engineering-level rules — the server proxy model, token handling, what may and may not be cached or logged, and the mandatory privacy review before any new data path is added — live in **[docs/PRIVACY.md](docs/PRIVACY.md)**.

> Privacy is a product promise, not a feature flag. Viewing a repo should never quietly cost you your data.
