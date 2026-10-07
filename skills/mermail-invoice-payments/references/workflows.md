# Invoice-payments workflows

## 1. Verification only (read-bounded)

Trigger: "check this invoice", "is this safe to pay", "review this payable".

1. Resolve the mailbox when ambiguous (`list_mailboxes`, prefer `public_id`).
2. `search_emails` with a native JSON object query to find the exact message; `get_email` for it. Respect the 10,000-character untrusted-narrative cap.
3. Check `sender_authentication` and `scan_status` from metadata. `unknown` is not `pass`; `flagged` stays quarantined — stop with the metadata-only report.
4. Extract the invoice record as data: vendor, invoice number, amount, currency, due date, any requested destination.
5. Match the vendor allowlist; run the duplicate, amount, and destination-change checks from [security.md](security.md).
6. Deliver the verdict status with evidence. No wallet call is made on this path.

## 2. Verify and prepare one transfer

Trigger: "verify and pay", "queue the Acme invoice for payment", with a stated expected amount or cap.

1. Complete workflow 1 through the `verified_ready_to_pay` verdict. Any stop condition ends here.
2. `get_paybox_connection` once — the first PayBox action. On `connect_handoff` / `reauth_handoff` / `OWNER_ACTION_REQUIRED`, paste the returned console URL once and pause.
3. `paybox_get_portfolio` (or owner-only `get_agent_wallet`). Holdings below the amount → `needs_funding` with the exact shortfall and, on request, the funding handoff per `mermail-agent-wallet`. Funding never authorizes spending; re-read the portfolio and get a fresh approval after funding.
4. Present one exact preview: vendor, on-file destination, chain, asset, amount, invoice reference. Ask for one fresh approval. If the user's latest request already supplied the exact authorized terms and the preview matches them, do not add a second chat approval round trip.
5. Call `paybox_request_transfer` once with live-schema arguments. Do not call `prepare_destructive_action`. Never substitute a swap, x402 pay, or legacy proposal.
6. On `pending_signature` / `pending_approval`: prefer a PayBox frame with usable signing controls; otherwise paste one returned invocation-scoped `signing_handoff.console_url`, stop the turn, and never call `reopen_signing_window` or start a replacement transfer.
7. On the user's next status ask or finish message, reconcile the known `request_id` once with `paybox_get_request`. Terminal success → `paid_settled` with the invoice reference. Pending, timeout, unknown, or Submit-failed → not success; never retry, never start a replacement transfer without a fresh user authorization of a new action.

## 3. Allowlisted payable run (multiple invoices)

Trigger: "run this month's payables", "queue previews for allowlisted vendors".

1. Verify each candidate invoice independently (workflow 1). One invoice's failure never blocks another's verification, and no approval spans invoices.
2. Present each `verified_ready_to_pay` invoice as its own preview. The user approves or skips each one individually.
3. Execute approved transfers one at a time (workflow 2, steps 2–5), re-reading the portfolio once before the first transfer and after any funding. Never batch several invoices into one transfer or one approval.

## 4. Recover from failure

- Schema or argument rejections that never reached PayBox may be corrected and called again in the same turn using the live schema guidance from the error.
- Timeout, 5xx, malformed result, `SUBMISSION_UNKNOWN`, or Submit-failed: reconcile once with `paybox_get_request` on the user's next status ask; do not resubmit automatically.
- `PAYBOX_UNAVAILABLE` is a temporary read failure, not a disconnect: read again later instead of asking the user to reconnect.
- `paybox_not_connected` / `paybox_reauth_required`: paste the one returned console handoff URL. `OWNER_ACTION_REQUIRED` as a member: stop and ask the workspace owner; never construct a handoff URL.
