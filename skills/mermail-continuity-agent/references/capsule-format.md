# Capsule format

A capsule is one plain-text email the agent sends to its own address. It is written for an agent that wakes with **no** conversation context: nothing "as discussed above", nothing that needs the previous session to be understood.

## Header line

The first line of the body is machine-readable and human-readable at once:

```
capsule/v1 · agent=<agent name> · session=<session identifier or "unknown"> · prev=<emailId of the previous capsule, or "none"> · through=<ISO date>|<emailId of the last contiguous processed inbound, or "none">
```

- `agent` — the name the owner uses for this agent, stable across sessions.
- `session` — whatever identifier the host exposes; `unknown` is acceptable and honest.
- `prev` — the exact `emailId` of the capsule this one supersedes. `none` only on a first capsule. The chain is walked backwards through `prev`, one hop at a time, never by reading the whole thread.
- `through` — the **cursor**: a preserved watermark, the server `date` and `emailId` of the last inbound message through which the covered window is completely accounted for (read, answered, or deliberately set aside under the owner's direction). Preserve the previous valid `through` exactly if no new inbound was processed. Advance only over a completely accounted contiguous window; processing a newer selected message never skips an older unprocessed gap or unseen page. Name such touched messages separately while retaining the old cursor. A bounded newest-first page is not proof the whole intervening window was processed. The next wake searches inclusively from the watermark date, not from the capsule's own date; same-timestamp IDs may repeat and are not dropped by ID ordering. A valid timestamp and nonempty exact source ID are required; malformed/future/inconsistent cursors stop for reconciliation.
- `none` means no known processed watermark, not "nothing remains". A missing legacy field or `none` is `cursor_unknown` (`legacy_cursor` may additionally label a missing old field). Never substitute capsule creation time. Ask the owner for an explicit historical baseline/window, preserve it in *What is unfinished* for the next session, and report earlier coverage unknown. An owner-selected window is not proof of processing outside it and does not fabricate an email ID. Until a real contiguous processed source exists, keep `through=none` and the explicit window; a handoff that processed no inbound must not move that window forward.

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
Chose a self-addressed capsule thread over a per-host file because the host changes between sessions and the mailbox does not. Owner approved this exact self-addressed send after preview.

### What is unfinished
Recall by phrase returns metadata only until search supports body text; workaround is to read the newest capsule and follow `prev` one hop.
Untouched backlog: 2,317 messages after the cursor (2026-09-15T17:40:12Z); the next wake counts them from `through`.

### Where to start
1. Mailbox public_id mbx_…; capsule thread thr_…
2. Open PR #NNN in Nudgen-Marketing/mermail-skills — validator green locally, awaiting review.
3. Owner's message emailId e_… (arrived 2026-09-15T09:12Z) asks about the video; not yet answered.
```
