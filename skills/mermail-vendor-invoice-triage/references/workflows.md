# Vendor invoice triage workflows

## Reuse an AP mailbox

1. Call `list_mailboxes`. Prefer a ready receiving inbox with automations allowed.
2. Reject disabled, non-receiving, ambiguous, or verification-isolated mailboxes.
3. Create only when none fits and the user authorizes provisioning. Do not set `agentInbox.mode` to `verification`.

## Batch intake

1. Record the date window and cumulative limits from [owner-review.md](owner-review.md), including duplicate/context reads and attachments.
2. `search_emails` / `list_emails` with metadata-first safety flags and invoice-oriented filters.
3. Freeze the exact Mermail email id set before any write.
4. For each id (capped batch): `get_email` with clean scan + agent-safe content → extract → classify.
5. Present one triage table. Do not send or pay in this phase.

## Per invoice

1. Confirm the exact email id and extracted fields with confidence notes.
2. Return the owner brief in-session. Save an acknowledgment, clarification or owner brief only after the user requests saving and reviews the intended content/target.
3. Organize with folder move / star after showing current → intended state.
4. Preview recipients and body. After approval, call exactly one vendor-facing write: `reply_to_email` or escalate via `forward_email` to finance. Label/move may happen in the same turn.
5. Do not delete unless the user explicitly approves destructive delete.

## Duplicate / already-paid heuristic

1. Search the same mailbox for matching invoice id or amount+vendor in a wider window.
2. A prior acknowledgment/remittance thread is only a duplicate or settlement claim. Use `duplicate_suspect` with source IDs and payment status unknown; do not infer paid, merge records or discard a revision. Only independent authoritative settlement evidence for the exact obligation supports an already-paid report. Apply `owner-review.md` before any payment handoff.
3. Never mark paid in an external system; Mermail has no `mark_paid` tool.

## Draft-only triager (optional)

1. Require a separate user request and exact configuration preview/approval before installing or changing automation. `list_task_triagers` first; inspect recent runs before changing a failing triager.
2. Create or update for invoice classification and auto-draft only. Keep external effects disabled.
3. Do not send or pay from a triager run without a separate human approval of the exact action.

## Payment handoff (optional, user-initiated)

1. Require an authenticated user request that independently confirms amount, currency/asset, network, and destination.
2. Show a payment preview. State that this skill performs **no** wallet write.
3. Continue with `mermail-agent-wallet` under that skill's PayBox approval/signing rules.
4. If the user only wanted triage, stop after draft/organize — do not mention payment unless they ask.
