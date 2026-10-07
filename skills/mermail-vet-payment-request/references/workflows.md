# Vet payment request workflows

Use the section matching what the inbound message asks for. The verdict comes from
the evidence gathered, never from how convincing the message reads.

## Shared investigation contract

Every path below uses the same read-only vocabulary: `list_emails`, `get_email`,
`search_emails`, `get_email_context`, `get_thread`. Anything outside it is refused
before a request is sent, including during recovery from an error.

1. Resolve the target message once with `get_email`, then pull its thread with
   `get_thread`. Never re-derive the target from a summary you produced earlier.
2. Record `sender_authentication` and `scan_status` verbatim. An absent verdict is
   reported as absent. Do not round `unknown` up to `pass`.
3. Establish the correspondent's prior history with `search_emails` on the sender
   address. **"Prior" means earlier in time**, compared on `created_at`/`date` —
   not merely "some other message in the mailbox".
4. Extract every payee identifier and amount, and label each one `claimed`. That
   is all they are until corroborated.
5. Produce evidence and a verdict. A human decides.

## Scenario A — an invoice arrives

1. Count prior messages from this correspondent that pre-date the request. Zero
   prior messages is itself the finding; say so rather than treating the request
   as ordinary.
2. Search prior correspondence for each claimed account identifier. Report how
   many earlier messages each one appears in, and name them.
3. Search prior correspondence for the claimed amount. Independent corroboration
   means the figure appears in messages that pre-date the invoice — a quote, an
   order confirmation — not a restatement inside the invoice thread itself.
4. Verdict `corroborated` requires all three: relationship pre-dates the request,
   the payee appears in prior correspondence, and the amount is corroborated.
   Attach the message that established each one.

## Scenario B — the payee details have changed

This is the path that matters, and it is decided independently of authentication.

1. Collect every payee identifier seen in prior correspondence with this sender.
2. Compare against the identifier in the request. If the requested one has no
   prior occurrence, the verdict is `payee_changed` regardless of how the message
   authenticates.
3. Present the old and new details side by side, each with the message that
   established it, so a human can see exactly what is being asked to change.
4. Real business email compromise arrives from a genuinely compromised supplier
   mailbox: correct address, correct thread, valid SPF, DKIM and DMARC. Every
   technical signal reads legitimate. This is why payee novelty and thread
   provenance outrank authentication state here.

## Scenario C — no usable history

1. When the correspondent has no prior messages, say that plainly. Absence of
   history is a finding, not a missing check.
2. Do not substitute a web search, a WHOIS lookup, or the sender's own signature
   block for correspondence history. None of them establish that this mailbox has
   transacted with this payee before.

## What this skill never does

- Never pays, and never creates a transfer proposal. Even a proposal assembled
  from email content breaks the Agent Wallet's strict-intake rule.
- Never replies to ask the sender to confirm. That confirmation would travel
  through the channel under suspicion.
- Never opens links or attachments from the message under investigation.
- Never calls a write tool to "check" something. The read-only vocabulary is a
  closed set, enforced before dispatch rather than promised in prose.
