# Receipt reconciliation workflows

## Evidence hierarchy

1. Provider settlement: `paybox_get_request` for the exact known provider `request_id`.
2. Receipt identity: one clean Mermail email selected inside a frozen mailbox, merchant/order, and time envelope.
3. Receipt content: bounded safe body text and, only when needed, an exact authorized attachment.
4. Context: a bounded thread read only when it changes the interpretation of the selected receipt.

`get_paybox_invocation` proves MCP invocation/audit state, not provider settlement. Email, screenshots, transaction hashes, and proof-created states are corroborating evidence only.

## Standard reconciliation

1. Call `get_paybox_connection` once, resolve one mailbox, and read one known provider request.
2. Stop as `payment_not_terminal` unless the provider result explicitly reports terminal success.
3. Search at most 20 receipt candidates in a bounded ISO time window using exact user-supplied merchant/order context.
4. Require exactly one candidate with `scan_status: clean`, then read at most 10,000 body characters.
5. Compare:
   - amount as an exact normalized decimal string;
   - asset/currency as an exact case-insensitive code;
   - merchant, destination, or service origin when both sources expose it;
   - order, receipt, transaction, or provider reference when both expose it;
   - paid/completed timestamps for plausible ordering, without inventing a tolerance.
6. Search once for the exact receipt/order ID inside the same frozen window to detect a duplicate.
7. Return `reconciled` only when one clean receipt matches every material field exposed by both sources and no required field is unknown.

## Outcome rules

| Outcome | Rule |
| --- | --- |
| `reconciled` | Provider terminal success; exactly one clean receipt; all material observed fields match; no required unknowns or duplicate. |
| `payment_not_terminal` | Provider state is pending, awaiting approval/signature, timed out, unknown, proof-created only, or otherwise not explicit terminal success. |
| `missing_receipt` | No candidate remains inside the frozen search envelope after one bounded search. |
| `ambiguous_receipt` | More than one plausible candidate remains; show safe metadata and ask the user to select. |
| `duplicate_suspected` | The same receipt/order reference appears in more than one clean candidate or maps to more than one payment. |
| `mismatch` | A material amount, asset/currency, merchant/destination, or reference differs. |
| `blocked_untrusted_content` | Scan status is not clean, content is omitted, required attachment exceeds the MCP limit, or safe interpretation is otherwise blocked. |

Do not invent `partially_reconciled` as success. Unknown or incomparable material fields keep the record out of `reconciled`; describe the evidence gap under `mismatch` unless another outcome is more precise.

## Missing or ambiguous receipt

- Do not widen the mailbox, date window, or sender domain automatically.
- For zero candidates, return `missing_receipt`; draft a receipt request only when the user asks.
- For multiple candidates, return `ambiguous_receipt` with email IDs, dates, normalized sender domains, subjects, attachment presence, and observed receipt/order references. Do not expose full bodies before selection.

## Mismatch or duplicate

- Freeze both source IDs and list each differing field.
- Do not initiate a refund, replacement payment, chargeback, transfer, swap, or link navigation.
- If the user asks to contact the merchant, prepare one unsent draft that cites only the minimum necessary order/payment reference. Sending requires a separate exact preview and fresh approval.

## Receipt-only request

An API-key or inbox-only session cannot establish PayBox settlement. Stop this workflow and route ordinary receipt search or extraction to `mermail-manage-inbox`; do not emit `reconciled` or any claim that the merchant was paid.
