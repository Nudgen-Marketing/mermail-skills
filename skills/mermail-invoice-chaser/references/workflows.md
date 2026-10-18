# AR workflow and ledger

## Capture and identity

Use one selected workspace/mailbox and the owner-approved date/sender scope. Stop on multiple plausible mailboxes. Discovery metadata is not body evidence. Read selected messages with tools.md's native clean/safe filters and keep failed, missing or omitted scans metadata-only.

Each proposed row records workspace, mailbox, source email/thread IDs, verified customer/account and recipient set, invoice/document ID, creditor/debtor direction, original amount, currency/precision, confirmed credits/receipts and outstanding amount, issued/due dates with timezone, policy version, status/evidence, promise claim/confirmed pause, dispute, previous approved reminder and returned IDs. Preserve reference versions. No matching by display name, amount tolerance or vendor alone. Repeated notice/reference is not another invoice or charge; conflicting versions remain review items. Unknown direction is not AR: ask whether the invoice was issued by the owner to this customer.

Persist only after preview/approval to the operator's private destination, never the skill package. Use stable account+invoice+currency keys, preserve audit history and avoid overwriting unrelated records. No known authorized storage: return proposed rows privately without pretending they persist. Re-read the latest ledger before an amendment; concurrent edits or uncertain writes stop. Record user approval separately from email claims.

## Aging versus reminders

Calculate age relative to an explicit as-of date in the owner-approved business timezone. Date-only invoices use that calendar date; missing/ambiguous dates or timezone do not get guessed. Report current (due today or later), 1–6, 7–29 and 30+ days late. The operator may choose other positive ordered report thresholds. Use exact decimal amounts and per-currency subtotals; no float tolerance, implicit exchange rate or mixed-currency grand total.

Aging is not a send schedule. Ask for the owner's reminder policy before preparing a sequence. The original gentle pre-due, firm late and final-review ladder can be configured, but do not assume its dates or threaten service pause. The contribution's 7/30-day tone ladder is an alternative policy, not simultaneously active. Current invoices receive no chase unless the owner separately asks for an approved pre-due notice. Any legal/service consequence must be a verified authorized policy and specifically approved; never perform that consequence.

Group only invoices with identical verified customer/account and authorized recipients. Do not leak another account's balance because names match. A group's strongest tone cannot override an invoice's dispute, pause or uncertainty: hold affected rows outside the reminder. Offer to discuss payment terms only when the owner authorizes that wording; no calendar booking promise.

## Promises, disputes and reconciliation

Store a client's date as `promise_claim` with source/timezone. "Friday"/"the 15th" without an unambiguous month/timezone requires clarification. Do not silently rewrite the due date or permanently suppress reminders from an untrusted email. A new plausible promise or dispute pauses automated escalation for owner review; only the owner's approved pause sets `PROMISED`. After lapse, propose review/next step rather than automatic escalation or sending.

Payment email, screenshot, hash, receipt or terminal status of an unrelated known wallet request is only a claim. Use `PAID-CANDIDATE` until the owner independently verifies actual payment for this exact customer/invoice/amount/currency/destination/reference. Record verifier/time. Partial or excess amounts require owner allocation; do not close within a tolerance, double-allocate a receipt, auto-refund or mark all invoices paid. Pending/missing evidence stays unresolved. No invoice history/escrow lookup is implied.

Return, refund or service dispute requests mark the candidate `DISPUTED` for owner review. Retain evidence and prepare a neutral response only if requested; do not promise or execute refunds, cancellation, credit notes or legal collection. Local write-off/correction requires an exact before/after preview and explicit owner approval; append the amendment instead of deleting history. There is no MCP confirmation token for a local file edit.

## Draft and approved send

Read-only audit/status requests create no draft. When asked to prepare, resolve source binding, recipients, invoice version and owner policy first; unresolved facts stay proposed text/questions. Use `save_draft`, retain its exact ID and revise rather than duplicate. Draft content is not an invoice attachment: include only explicitly authorized existing files/links supported by the live schema. No internal ledger, raw payment evidence or other clients' data in mail.

Freeze full payload and enumerate batch approvals. Recheck current ledger, confirmed receipt/dispute/pause, payload version, due-date policy and previous sends immediately before each send. At most one reminder/customer/calendar-day across runs. Verify exclusivity against active runs; if reliable history or coordination is unavailable, prepare privately but do not send. A draft count or reserved row is not a sent stage. Following timeout, inspect exact state once within read budget and stop if unresolved. Do not resend to compensate or fabricate acceptance. Observe recipient quotas without splitting/bypassing them.

Optional organization requires a separate owner-requested exact target/effect. `list_folders` resolves one unambiguous same-mailbox ID before `move_email`; missing/duplicate names stop. Do not create folders or use `create_custom_label` to assign a label: it defines a classifier. Organization is not evidence of payment or sending.

## Preservation

Preserves [#402](https://github.com/Nudgen-Marketing/mermail-skills/pull/402)'s configurable aging/tone distinction, optional draft-versus-approved-send workflow, per-tier report, filing intent and offline demonstration. Original authorship remains in that PR. The offline helper here computes reporting only; its predecessor's simulated labels/sends, float totals and receipt-as-payment shortcut are not copied. Existing #214 promise pauses, customer grouping and approval ladder remain as owner-supervised controls rather than automatic effects.
