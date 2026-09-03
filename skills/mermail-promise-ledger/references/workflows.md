# Promise ledger workflows

## Capture from a conversation

1. Read the thread with `get_email_context` (preferred) or `get_thread`.
2. Extract every explicit commitment into a ledger entry:
   - `id`: `PL-YYYY-MM-DD-NNN`
   - `promise`: one sentence, verbatim-anchored to the thread
   - `direction`: `outbound` (we promised) or `inbound` (they promised)
   - `counterparty`: email address
   - `due`: ISO date, or `none`
   - `status`: `open` | `kept` | `broken` | `cancelled` | `unverifiable`
   - `evidence_email_id`: the email the commitment was made in
3. Explicit only. Implied intent ("let's stay in touch") is not a promise.
4. Label the source email via the `promise/<status>` custom label.
5. `inbound` promises are expectations: track, never auto-act.

## Take over an inbox

1. `search_emails` for commitment patterns ("by Monday", "I will send",
   "due date", "we will deliver", "next steps", "follow up") across the
   retention window, oldest first. Cap the sweep at 200 results and report
   truncation.
2. Run capture (workflow above) on every hit.
3. Present the reconstructed ledger for user confirmation before any
   reporting or drafting.

## Audit open promises

1. Filter ledger entries with `status == "open"`.
2. For each entry due within the audit window (default 7 days):
   - Re-read the thread with `get_email_context`.
   - Classify: `kept` / `still-open` / `at-risk` (due soon, no delivery
     evidence) / `broken` (deadline passed).
   - Update the label and ledger entry.
3. Report: open by age, at-risk list, kept/broken ratio.

## Draft status updates

1. For every at-risk or broken `outbound` promise:
   - Draft with `save_draft`: honest, specific, references the original
     commitment, proposes a new date or delivery.
   - Show the user the exact draft. Sending is a separate user-approved
     `reply_to_email` action in the owning compose skill.
2. For `inbound` promises: draft a polite reminder only when the user
   explicitly asks.

## Handover

1. Export the ledger as the handover artifact when the mailbox changes
   agents.
2. New agents reconstruct outstanding obligations on takeover (see
   "Take over an inbox").
