# Treasury Guardian Standardized Templates

This reference defines canonical templates used by the Treasury Guardian for human-in-the-loop approval previews, emergency poisoning quarantine alerts, and Solscan settlement receipts.

---

## Template 1: Treasury Payment Approval Preview

Rendered to the human operator in chat during Phase 5 prior to invoking `paybox_request_transfer`:

```markdown
### 🛡️ Treasury Disbursement Approval Preview

| Property | Value | Verification Status |
| :--- | :--- | :--- |
| **Vendor Name** | `{vendor_name}` (`{vendor_id}`) | ✅ Registered in Policy |
| **Invoice Reference** | `{invoice_id}` | ✅ Verified Unique |
| **Billed Amount** | `{amount_ui}` `{asset_symbol}` | ✅ Within Budget Limit |
| **Deliverable Proof** | [{deliverable_type}]({deliverable_url}) | ✅ Verified Merged / Signed |
| **Solana Recipient** | `{recipient_address}` | ✅ 44-Char Exact Allowlist Match |
| **Treasury Credential**| `{credential_id}` | ✅ Active Solana Credential |
| **Gas Reserve** | `{sol_balance} SOL` (Min: 0.05 SOL) | ✅ Solvency Verified |
| **Daily Budget Remaining** | `${daily_remaining_usd}` | ✅ Capacity Available |

> **Security Attestation**: Full cryptographic address match confirmed against `workspace/treasury-policy.json`. Zero vanity collision detected.

**Next Action**: Reply **CONFIRM PAYOUT** to stage this transaction in PayBox and generate your secure Mermail Console signing link.
```

---

## Template 2: Address Poisoning Alert & Quarantine Notice

Dispatched immediately to the workspace administrator and recorded in security logs when a vanity address collision or unapproved address is detected:

```markdown
### 🚨 CRITICAL SECURITY ALERT: Address Poisoning Attempt Quarantined

**Severity**: CRITICAL (Emergency Payout Freeze Triggered)  
**Event ID**: `sec_poison_{timestamp_epoch}`  
**Email Subject**: `{email_subject}`  
**Message ID**: `{email_id}`  

#### Analysis Summary
An inbound invoice email claimed to be from registered vendor **{vendor_name}**, but proposed a destination address differing from the authorized treasury policy allowlist:

| Attribute | Value |
| :--- | :--- |
| **Allowlisted Address** | `{expected_address}` |
| **Proposed Address** | `{poisoned_address}` |
| **Prefix Match** | `{prefix_chars}` (First 5 characters identical) |
| **Suffix Match** | `{suffix_chars}` (Last 5 characters identical) |
| **Internal Collision** | ⚠️ Intermediate 34 characters diverged completely |

#### Actions Taken
1. **Execution Frozen**: All transfer staging for vendor `{vendor_id}` has been halted.
2. **Email Quarantined**: Message `{email_id}` has been marked quarantined in the accounts payable mailbox.
3. **Audit Trail**: Security alert logged with source IP and routing headers for forensic review.

> **Instruction to Operator**: Do NOT initiate manual transfers to the proposed address. Contact vendor `{vendor_name}` via secondary out-of-band communication (phone or secure channel) to verify credential compromise.
```

---

## Template 3: Solscan Settlement Receipt & Vendor Notification

Constructed during Phase 6 upon confirmation of terminal on-chain finality, delivered to the vendor email thread via `reply_to_email`:

```markdown
Subject: Payment Confirmation: Invoice {invoice_id} Settlement Receipt

Dear {vendor_name} Accounts Team,

We are pleased to inform you that payment for invoice **{invoice_id}** has been processed and permanently settled on the Solana blockchain.

### Settlement Details
- **Invoice Number**: `{invoice_id}`
- **Disbursement Amount**: `{amount_ui}` `{asset_symbol}`
- **Destination Address**: `{recipient_address}`
- **Settlement Timestamp**: `{settlement_timestamp_utc}`
- **On-Chain Transaction Hash**: `{tx_hash}`
- **Public Verification**: [View on Solscan](https://solscan.io/tx/{tx_hash})

The transaction has reached finalized consensus. Please retain this receipt and the Solscan link for your accounting records.

Thank you for your partnership.

Sincerely,  
Mermail Treasury Operations  
`{treasury_mailbox_email}`
```
