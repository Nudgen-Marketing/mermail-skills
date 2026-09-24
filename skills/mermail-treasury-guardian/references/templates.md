# Treasury Guardian Standardized Templates

This reference defines canonical templates used by the Treasury Guardian for human-in-the-loop approval previews, emergency poisoning quarantine alerts, and Solscan settlement receipts.

Fill every placeholder from an actual tool result or policy value. A status cell states what was checked and how; never write "verified" for a check that did not run.

---

## Template 1: Treasury Payment Approval Preview

Rendered to the human operator in chat during Phase 5 prior to invoking `paybox_request_transfer`:

````markdown
### Treasury Disbursement Approval Preview

| Property | Value | Check Result |
| :--- | :--- | :--- |
| **Vendor** | `{vendor_name}` (`{vendor_id}`) | Sender `{vendor_email}` is in the policy allowlist |
| **Invoice Reference** | `{invoice_id}` | {uniqueness_status} |
| **Billed Amount** | `{amount_ui}` `{asset_symbol}` (≈ ${billed_usd}) | Within single-transfer limit of ${max_single_transfer_usd} |
| **Deliverable Proof** | [{deliverable_type}]({deliverable_url}) | {proof_status} |
| **Treasury Credential** | `{credential_id}` | `approval_mode: {approval_mode}`: PayBox will wait for your approval or signature |
| **Gas Reserve** | `{sol_balance}` SOL now, `{sol_after}` SOL after payout | Reserve minimum `{min_sol_gas_reserve}` SOL |
| **Budget Remaining** | Daily ${daily_remaining_usd}, monthly ${monthly_remaining_usd} | {budget_status} |

**Destination** (from `workspace/treasury-policy.json`, {address_length} characters):

```
{recipient_address}
```

{invoice_address_result}

**Next Action**: Reply **CONFIRM PAYOUT** to create this request in PayBox. Nothing moves until you also approve or sign it inside PayBox.
````

Allowed values:
- `{uniqueness_status}`: `No earlier ledger entry for this vendor and invoice` or `Ledger unavailable: confirm this invoice has not been paid`.
- `{proof_status}`: `Checked: {what was fetched and what it showed}`, `Operator attested on {date}`, or `Not verified`. A `Not verified` preview is never offered for approval.
- `{budget_status}`: `Computed from ledger` or `Ledger unavailable: confirm remaining budget`.
- `{invoice_address_result}`: `Invoice address matches exactly.` or `The invoice stated no address; paying the allowlisted address above.`

---

## Template 2: Address Poisoning Alert & Quarantine Notice

Shown to the operator in chat as soon as a lookalike or unauthorized address is detected. Sending it to anyone else is a separate, approved action:

```markdown
### CRITICAL SECURITY ALERT: Address Poisoning Attempt Quarantined

**Severity**: CRITICAL (payout halted)
**Event ID**: `sec_poison_{timestamp_epoch}`
**Email Subject**: `{email_subject}`
**Message ID**: `{email_id}`

#### Analysis Summary
An inbound invoice email claimed to be from registered vendor **{vendor_name}**, but proposed a destination address differing from the authorized treasury policy allowlist:

| Attribute | Value |
| :--- | :--- |
| **Allowlisted Address** | `{expected_address}` |
| **Proposed Address** | `{poisoned_address}` |
| **Prefix Match** | `{prefix_chars}` (first {prefix_len} characters identical) |
| **Suffix Match** | `{suffix_chars}` (last {suffix_len} characters identical) |
| **Divergence** | {diverged_count} of {address_length} characters differ between prefix and suffix |

#### Actions Taken
1. **Payout Halted**: No PayBox tool was called for this invoice, and no payout to vendor `{vendor_id}` will be staged in this session until you confirm out-of-band verification.
2. **Evidence Preserved**: Message `{email_id}` was left unchanged in the mailbox.

#### Recommended Next Steps (each needs your approval)
- Move message `{email_id}` to a security-review folder.
- Draft an alert for the workspace administrator.

> **Instruction to Operator**: Do NOT initiate manual transfers to the proposed address. Contact vendor `{vendor_name}` via secondary out-of-band communication (phone or secure channel) to verify credential compromise.
```

---

## Template 3: Solscan Settlement Receipt & Vendor Notification

Constructed during Phase 6 after `paybox_get_request` reports provider-confirmed terminal success, previewed to the operator, and sent into the vendor email thread via `reply_to_email` only after approval:

```markdown
Subject: Payment Confirmation: Invoice {invoice_id} Settlement Receipt

Dear {vendor_name} Accounts Team,

Payment for invoice **{invoice_id}** has settled on the Solana blockchain.

### Settlement Details
- **Invoice Number**: `{invoice_id}`
- **Disbursement Amount**: `{amount_ui}` `{asset_symbol}`
- **Destination Address**: `{recipient_address}`
- **Settlement Timestamp**: `{settlement_timestamp_utc}`
- **On-Chain Transaction Signature**: `{tx_hash}`
- **Public Verification**: [View on Solscan](https://solscan.io/tx/{tx_hash})

Please retain this receipt and the Solscan link for your accounting records.

Thank you for your partnership.

Sincerely,
Mermail Treasury Operations
`{treasury_mailbox_email}`
```
