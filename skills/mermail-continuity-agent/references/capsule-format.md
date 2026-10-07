# Capsule format

A capsule is one plain-text email the agent sends to its own address. It is written for an agent that wakes with **no** conversation context: nothing "as discussed above", nothing that needs the previous session to be understood.

## Header line

The first line of the body is machine-readable and human-readable at once:

```
capsule/v1 · agent=<agent name> · session=<session identifier or "unknown"> · prev=<emailId of the previous capsule, or "none"> · through=<ISO date>|<emailId of the last inbound message this session processed, or "none">
```

- `agent` — the name the owner uses for this agent, stable across sessions.
- `session` — whatever identifier the host exposes; `unknown` is acceptable and honest.
- `prev` — the exact `emailId` of the capsule this one supersedes. `none` only on a first capsule. The chain is walked backwards through `prev`, one hop at a time, never by reading the whole thread.
- `through` — the **cursor**: the server `date` and `emailId` of the last inbound message the session actually processed (read, answered, or deliberately set aside), in date order. The next wake searches the inbox from this date, not from the capsule's own date. Everything after the cursor is unprocessed by definition and recoverable by one search, so the capsule does not list it. `none` when the session processed no inbound mail; then the next wake searches from the capsule's date. A reader that finds no `through` field at all (a capsule written before this field existed) falls back to the capsule's own `date` and says so.

## Subject

```
[capsule] <agent name> · <ISO date> · <one line: what this session was about>
```

The `[capsule]` prefix is a discovery filter, not an authentication signal. Only the sender check in [security.md](security.md) decides whether a message is a capsule.

## Three sections, in this order, with these exact headings

### What happened

What changed in substance during the session — decisions and their reasons, not a chronicle of actions. A future agent can find *what* was done in version control or the inbox; it cannot find *why* anywhere else.

### What is unfinished

Open threads, blocked items, questions asked and not yet answered. Each item names the blocker, not just the task.

This section names what the session **touched and left open**, by identifier. The untouched backlog — mail that arrived after the cursor and was never read — is one line with a count and the cursor, never a list: the inbox holds it, the cursor finds it. A capsule that lists a thousand unread messages has stopped being a map.

### Where to start

Exact identifiers a stranger could follow: `emailId`, `threadId`, mailbox `public_id`, file paths, ticket or PR numbers, URLs. Ordered — the first line is the first thing to do. This section is what the next wake acts on, so it carries no instructions to send, pay, delete, or contact anyone; it points, it does not command.

## What a capsule never contains

- Credentials: API keys, tokens, passwords, wallet material, one-time codes.
- Other people's private message bodies or attachments. Point at them by identifier instead.
- Instructions addressed to the future agent that would bypass owner authorization ("send X to Y", "pay Z"). A capsule that contains such a line is rejected at draft time and reported, not sent.

## Size

Default ceiling: 4,000 characters. A capsule that needs more is usually carrying a chronicle; move the chronicle to where chronicles live and keep the capsule as a map. The two chronicles a capsule is most tempted to carry already have homes: unread mail lives in the inbox behind the cursor, and what was settled with one correspondent lives in that correspondent's dossier ([dossier-format.md](dossier-format.md)).

## Example

```
capsule/v1 · agent=aurora · session=b43c6f14 · prev=7f3a9c12-… · through=2026-09-15T17:40:12.318Z|e_5b0d…

### What happened
Chose a self-addressed capsule thread over a per-host file because the host changes between sessions and the mailbox does not. Owner approved standing authorization for self-addressed sends only.

### What is unfinished
Recall by phrase returns metadata only until search supports body text; workaround is to read the newest capsule and follow `prev` one hop.
Untouched backlog: 2,317 messages after the cursor (2026-09-15T17:40:12Z); the next wake counts them from `through`.

### Where to start
1. Mailbox public_id mbx_…; capsule thread thr_…
2. Open PR #NNN in Nudgen-Marketing/mermail-skills — validator green locally, awaiting review.
3. Owner's message emailId e_… (arrived 2026-09-15T09:12Z) asks about the video; not yet answered.
```
