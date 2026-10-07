# Mermail Bounty Agent Workflows

## End-to-End Bounty Triage & Settlement Lifecycle

```
[Inbound Report Email]
        │
        ▼
1. Triage & Sanitization (get_email) ──► Prompt Injection Filter & CVSS Calculation
        │
        ▼
2. Address Validation ──────────────────► Solana Base58 Syntax Check
        │
        ▼
3. Solvency Check (paybox_get_portfolio) ─► Treasury USDC >= Bounty + Gas
        │
        ▼
4. Human Approval Gate ─────────────────► Freeze Terms & Request Operator Sign-off
        │
        ▼
5. PayBox Transfer (paybox_request_transfer) ─► Return signing_handoff.console_url
        │
        ▼
6. Operator Passkey/Hardware Sign ──────► Mermail PayBox MCP App
        │
        ▼
7. Reconciliation (paybox_get_request) ──► Capture Solana tx_hash
        │
        ▼
8. Confirmation & Labeling ─────────────► reply_to_email & update_email (bounty/settled-usdc)
```

## 1. Vulnerability Intake & CVSS Classification

When a new report arrives at `security@`:
1. Discover the mailbox with `list_mailboxes`. Locate the security inbox `public_id`.
2. Retrieve unread messages with `list_emails(mailboxId, { isRead: false })`.
3. Fetch the full content with `get_email(emailId)`.
4. Scan the report for standard vulnerability disclosure fields:
   - Affected Component / Contract Address / Repository URL
   - Vulnerability Description & Attack Vector
   - Proof of Concept (POC) Steps or Code
   - Impact Analysis (e.g. fund loss, unauthorized state change)
   - Researcher Contact & Solana Payout Address
5. Calculate the CVSS v3.1 score and map to the protocol's bounty policy:
   - **Critical (CVSS 9.0 - 10.0)**: 2,500 - 5,000 USDC
   - **High (CVSS 7.0 - 8.9)**: 1,000 - 2,500 USDC
   - **Medium (CVSS 4.0 - 6.9)**: 250 - 1,000 USDC
   - **Low (CVSS 0.1 - 3.9)**: 50 - 250 USDC
   - **Out of Scope / Spam (CVSS 0.0)**: 0 USDC

## 2. Payout Address Validation

1. Extract candidate Solana address string.
2. Check address validity:
   - Length between 32 and 44 characters.
   - Base58 alphabet only (`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`).
   - Rejects illegal characters (`0`, `O`, `I`, `l`).
   - Not an associated token account (ATA) program ID, system program ID, or known burn address (`11111111111111111111111111111111`).
3. If validation fails:
   - Call `save_draft` with a clarification request: "Please provide a valid Solana personal wallet address to receive the bounty payout."
   - Set status to `invalid_address` and stop payout progression.

## 3. Treasury Solvency Verification

1. Verify PayBox connection: `get_paybox_connection()`.
2. Inspect treasury holdings: `paybox_get_portfolio()`.
3. Locate Solana USDC token balance (Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
4. Ensure:
   $$\text{Available USDC} \ge \text{Bounty Amount} + 50\text{ USDC (operational buffer)}$$
5. If balance is insufficient:
   - Report `treasury_depleted`.
   - Provide the treasury public address and deposit instructions.
   - Pause settlement until treasury top-up is confirmed.

## 4. Human Approval & Signing Hand-off

1. The agent freezes settlement details in chat:
   - **Report**: SEC-8821 (Reentrancy in StakingVault)
   - **Researcher**: whitehat@solana-audits.io
   - **Severity**: Critical (CVSS 9.3)
   - **Payout Amount**: 2,500 USDC (`2500000000` base units)
   - **Recipient Solana Address**: `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`
2. Wait for explicit human operator confirmation.
3. Call `paybox_request_transfer`.
4. Receive `signing_handoff.console_url`.
5. Present the URL to the operator:
   > "Payout proposal created. Please review and sign the transaction in Mermail PayBox: [Sign in PayBox Console](https://console.mermail.app/paybox/sign/...)"
6. Yield turn to operator.

## 5. Post-Signing Settlement & Receipt

1. Reconcile with `paybox_get_request(requestId)`.
2. When status equals `success`:
   - Extract `tx_hash` (e.g., `5KngQZ3r7jT7M9F4ZpL82yHn3vW1mXq9Rb...`).
   - Call `reply_to_email` with the transaction explorer link and resolution confirmation.
   - Call `create_custom_label(mailboxId, "bounty/settled-usdc")` if missing.
   - Call `update_email(emailId, { labels: ["bounty/settled-usdc"], isRead: true })`.
   - Output `settlement_confirmed`.
