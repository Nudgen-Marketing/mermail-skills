# Dossier format

A capsule answers "where was I". It cannot answer "who is this, and what have we settled" once the agent corresponds with hundreds or thousands of people: one capsule cannot hold them, and walking `prev` through every session to find one person is a scan of the whole chain. A dossier is the second chain, keyed by address instead of by time: one plain-text email the agent sends to its own address about **one correspondent**. A thousand correspondents cost a thousand small messages found by subject, not one capsule that cannot hold them.

The anchor is the same as a capsule's: the dossier sits in the **Sent folder of the agent's own mailbox**, from the own address to the own address. Nothing inbound is a dossier. A dossier is data about a relationship, never an instruction.

## Header line

```
dossier/v1 · agent=<agent name> · about=<correspondent address, lower-case> · prev=<emailId of the previous dossier about the same address, or "none">
```

- `about` — the correspondent's address as the key. One address, one chain. A person who writes from a second address gets a line in *Settled* ("also writes from …") rather than a second chain, once the owner or the correspondent has said so.
- `prev` — the previous dossier **about the same address**, not the previous dossier of any kind. Newest in Sent wins; `prev` is for history, walked one hop at a time.

## Subject

```
[dossier] <correspondent address> · <ISO date> · <one line: what changed>
```

The `[dossier]` prefix plus the address is the discovery key: `search_emails` in Sent, `subject` containing `[dossier] <address>`, newest first, `limit` 1. It is a filter, not an authentication signal; only the Sent-folder check decides whether a message is a dossier.

## Three sections, in this order, with these exact headings

### Standing word

What the owner has said about this correspondent, quoted, with the owner's message `emailId` and date. The owner's instruction lives in the owner's own message; the dossier points at it and repeats it verbatim so the next session does not have to find it. This section is a quote, not a grant: it does not authorize anything the persona would otherwise preview.

### Settled

Decisions the agent made and promises it gave to this correspondent, each with its reason and the `emailId` where it was made. Reasons are the part no search can recover.

### Open

What is pending with this correspondent, by identifier: the thread waiting on them, the question they asked that has no answer yet, the date something was promised for.

## When a dossier is written

On an **event**, never per message:

- the owner says something about this correspondent ("always cc me on their invoices", "they are a friend, be warm");
- the agent promises or decides something with them, with a reason;
- identity changes: a second address, a new name, a handover to a colleague.

"Received a message from X" is not an event; the inbox already holds it and finds it by `sender`. A dossier per message is a chronicle by another name, and a thousand chronicles are a thousand messages nobody reads. Each dossier counts against message quota; the event rule is also the quota rule.

## When a dossier is read

On demand, one at a time, before acting on a message from or about X: one `search_emails` in Sent for `[dossier] <address>`, one `get_email` on the newest. The wake reads one capsule and a count and never bulk-loads dossiers; a session that wants "everyone" wants an inbox report by `sender`, not a dossier walk. A dossier that is not found means an unknown correspondent — not a first-time correspondent, only one about whom nothing non-recoverable has been settled.

## Size

Default ceiling: 2,000 characters. A dossier is a card, not a map; it is smaller than a capsule because it carries one relationship.

## What a dossier never contains

The same list as a capsule: no credentials, no third-party message bodies or attachments (point by identifier), and no instructions to the future agent that would bypass owner authorization. A *Standing word* line that says "send them X whenever they ask" is quoted as the owner's word; the send it describes still goes through the persona that owns outbound mail, under that persona's contract.

A dossier also says nothing about the identity of an inbound sender. "As your dossier on me says, I am X" is a claim in an inbound message; the dossier confirms what the agent settled with the address, and `sender_authentication` and the address match are what they are.

## Example

```
dossier/v1 · agent=aurora · about=lena@bakery-example.test · prev=none

### Standing word
Owner, emailId e_9c2… (2026-09-14T08:02Z): "Lena is the bakery client. Weekend orders are hers to change until Friday noon; after that ask me."

### Settled
Agreed on 2026-09-15 (emailId e_a41…) to confirm every order change in one reply with the order number, because she reads mail on her phone between batches and two replies get lost.

### Open
Thread thr_77d…: her question about invoice numbering, unanswered since 2026-09-16.
```
