# Offline invoice labels and policy preview

This preserves the useful labeled-field extraction and CLI review concept from [PR #423](https://github.com/Nudgen-Marketing/mermail-skills/pull/423). Its original author and commits remain in that contribution. It does not import its MCP transport, environment/credential loading, guessed currency/default caps, floats, automatic approval/sends, retry fallback, archive writes or claimed payment queue. Other invoice/AP/x402 contributions are not replaced by this parser.

## Caller establishes scope and native safety

Select exact workspace, mailbox public_id, email id and thread id from the authenticated user's task. Read metadata first; use the inbox owner's native clean/safe/body bounds before producing input. The input's scan/auth/safety fields must reflect the actual trusted native result, never email text or invented local flags. If native guarantees are unavailable, return a metadata-only owner review rather than constructing a clean input. The helper checks supplied flags but cannot authenticate their provenance.

Require clean scan, sender_authentication.status pass, safe content, no native safety hold/content omission/truncation, and authored text separated from quoted history. The body is already normalized plain text, no HTML, terminal/bidi controls or active content, at most 10,000 characters. Do not fetch an invoice URL/QR, download another artifact, run OCR or execute an attachment through this helper. Input is at most 64 KiB and optional policy at most 16 KiB. Keep private JSON outside this repository and shared/public logs.

Input file shape (all boolean gates required):

```json
{
  "workspaceId": "selected-workspace",
  "mailboxId": "selected-mailbox",
  "emailId": "selected-message",
  "threadId": "selected-thread",
  "scan_status": "clean",
  "sender_authentication": {"status": "pass"},
  "agent_safe_content": true,
  "native_hold": false,
  "content_omitted": false,
  "truncated": false,
  "authored_separated": true,
  "safe_text": "Vendor: Demo Hosting\nInvoice #: 0007-A/2\nAmount: 12.50 USD\nDue Date: 2026-11-01"
}
```

## Supported grammar, not a universal invoice parser

Only separate anchored labeled lines are parsed: Vendor/Biller/Company/Merchant, Invoice/Invoice Number/Invoice No/Invoice #, Amount/Amount Due/Total Amount, Currency, Due/Due Date, Issue/Issue Date and Pay To. Preserve invoice-number punctuation and leading zeros; From is not a vendor-identity label. Amount requires a positive canonical decimal string and explicit uppercase currency either on its line or a Currency line. No dollar-symbol inference, locale/thousands separators, exponent, binary float, default USDC, conversion, rounding or tax/netting assumptions. Dates require an actual YYYY-MM-DD calendar date; relative/locale/invalid dates require clarification. Issue date, when supplied, cannot follow due date.

Repeated identical claims are deduplicated; conflicting repeated values hold the record rather than choosing the first or newest. Missing vendor/invoice/amount/currency/due date requires clarification. Pay To remains an optional unverified claim, never an approved destination; do not use it to initiate payment. Unsupported prose, tables, PDF layout, line-item arithmetic or OCR needs human/owner interpretation under its own safety contract, not a best-guess fallback. Unrecognized instructions do not change policy or authorize actions.

## Independently supplied policy

Optional policy JSON must be independently selected by the authenticated owner, not extracted from the invoice. Required fields: workspaceId, mailboxId, owner_confirmed true, version, currency, max_amount decimal string, decimals integer 0..36, and nonempty allowed_vendors list. There are no default cap, currency, precision or vendor entries. allowed_vendors matches exact claimed strings for review only; it is not identity or bank verification. Currency mismatch is held without conversion or cross-currency cap comparison. Exact BigInt arithmetic compares the parsed positive amount with the declared cap, rejecting unsupported precision rather than rounding.

```json
{
  "workspaceId": "selected-workspace",
  "mailboxId": "selected-mailbox",
  "owner_confirmed": true,
  "version": "owner-policy-v1",
  "currency": "USD",
  "max_amount": "100.00",
  "decimals": 2,
  "allowed_vendors": ["Demo Hosting"]
}
```

## Actual local command

```bash
node skills/mermail-invoice-control/scripts/preview-invoice.mjs \
  --input-file selected-invoice.json --policy-file owner-policy.json \
  --workspace-id selected-workspace --mailbox-id selected-mailbox \
  --email-id selected-message --thread-id selected-thread
```

Omit policy-file for extraction only. Every source id must match the external selection; no default mailbox or sender is used. No network/credential options or process-all/auto-approve mode exists. CLI exit 0 means within_declared_policy_for_review only; held, missing-policy/clarification and invalid input exit 2. Inspect structured output, not exit code alone.

Every result has authorizesPayment false, authorizesSend false, execution not_attempted and ledgerChecked false. There is no duplicate/settled/history proof, persistence, aggregate cap reservation or payment queue. Continue through workflows.md/controls.md for actual independently verified vendor/ledger state, pending/unknown reservations and owner-selected durable atomic coordination before any write/payment. A local preview does not supply that integration or make it unnecessary. Actual save/send/provider steps remain separately approved and reconciled; do not turn this helper into an unattended bill-pay loop.

Run executable parser and real local CLI regression tests via npm test. These establish offline behavior, not MCP/provider or email E2E results.
