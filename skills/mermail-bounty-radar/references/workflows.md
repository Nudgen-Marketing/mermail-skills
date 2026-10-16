# Workflows

## 1. First-run profile setup

Ask once, in one message, and record the answers in the run notes:

1. **Skill keywords** — what the user can actually do (e.g. `python, solana, rust, technical writing`). Used for match scoring only.
2. **Minimum reward** — USD floor (e.g. `100`). Items below it are filtered silently.
3. **Sources** — `superteam`, `github`, or both. Default: both.
4. **Cadence** — `once`, `daily`, or `weekly`. For recurring, confirm the digest mailbox and use `schedule_email_send`.
5. **Destination mailbox** — resolve with `list_mailboxes`; default to the primary mailbox.

Never invent keywords. If the user says "you decide", propose a profile from the conversation and get explicit confirmation before the first scan.

## 2. Source polling

**Superteam Earn** — `GET https://superteam.fun/api/listings`, then keep items where:
- `status` is open/published AND `deadline` is in the future (parse ISO-8601; drop on parse failure),
- `rewardAmount` ≥ minimum reward (normalize `USDG`/`USDC` 1:1 to USD for comparison; skip unknown tokens),
- not previously delivered (compare `id` against the last digest thread).

Note the `agentAccess` field (`AGENT_ALLOWED` / `AGENT_ONLY` / `HUMAN_ONLY`) in the digest so the user knows which ones an agent can enter directly.

**GitHub** — `GET https://api.github.com/search/issues` with `q=label:bounty state:open` plus `repo:` qualifiers for repos with verifiable payout history (maintain the list from run notes; starter set: repos whose contribution guides document paid bounties and show merged bounty PRs). Keep items where the issue is open, has no linked merged PR, and was updated recently. Extract the bounty amount from the issue body/labels when present; mark `reward unknown` otherwise rather than guessing.

Bound every fetch: one request per source per run, 15s timeout, single retry. On source failure, deliver the partial digest and name the failed source — never silently drop a source.

## 3. Scoring and ranking

Score = (reward_norm × 0.4) + (profile_match × 0.4) + (urgency × 0.2):

- **reward_norm**: `min(reward_usd / 1000, 1)` — a $1000+ bounty scores 1.0.
- **profile_match**: fraction of the user's skill keywords appearing in title+description (0–1). Below 0.25 → filtered out.
- **urgency**: `1 - min(hours_until_deadline / 168, 1)` — under a week scores high; no deadline → 0.3.

Sort descending. Cap the digest at 10 items; note the count of filtered items and why (below floor / no match / duplicate / expired).

## 4. Digest composition

Subject: `🎯 Bounty radar — {date} ({n} matches)`.

Body (HTML or text), per item:
- **Title** — reward + token + deadline
- One-line fit reason ("matches: python, solana · agent-allowed · 3d left")
- Direct link (Superteam listing URL or GitHub issue URL)

Footer: sources polled, items seen → delivered counts, profile keywords, and the exact prompt to re-run ("radar again" / "radar weekly").

## 5. Approval and send

Present the exact preview: from-mailbox, To, subject, full body. Obtain explicit approval, then `send_email` once. For recurring cadence, `schedule_email_send` with the ISO-8601 send time. After sending, record the delivered item IDs (in the run notes or by reading back the sent thread) for next-run de-duplication.

## 6. Scheduled operation

For `daily`/`weekly`: the agent host re-invokes this skill on the cadence (cron, scheduled task, or the client's scheduler). The skill itself never starts a daemon. Each run is independent: re-read the profile, re-poll, de-duplicate against the last delivered digest, send only if there is at least one new match — silence is better than a "no new bounties" email.
