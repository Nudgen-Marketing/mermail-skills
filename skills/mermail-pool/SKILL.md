# Autonomous Freelance Escrow & Payout Agent

## Overview

This skill defines the **Mermail Payout Agent**, an autonomous workflow within the Mermail architecture responsible for escrow release, bounty distribution, and automated subscriber payouts. It integrates Mermail's messaging inbox with on-chain wallet operations to execute trustless, verified payment flows.

The agent operates across two primary service domains:
1.  **Mermail Inbox**: Parses intent, extracts payment instructions, and validates escrow conditions from incoming data streams.
2.  **Mermail Wallet**: Verifies balances, executes gas-optimized transfers, and generates on-chain proof of payout.

---

## Client Configuration

### Claude Desktop MCP Integration

Add the following block to `~/.config/claude/settings.json` or the equivalent configuration file:

```json
{
  "mcpServers": {
    "mermail": {
      "command": "npx",
      "args": [
        "@mermail/mcp-server@latest"
      ],
      "env": {
        "MERMAIL_NETWORK": "mainnet",
        "MERMAIL_GAS_LIMIT": "200000"
      }
    }
  }
}
```

### Cursor Rules Integration

Create `.cursor/rules/mermail-payout.mdc` to enforce behavioral constraints during chat interactions:

```markdown
# Mermail Payout Skill
Trigger: User mentions "pay out", "bounty", "escrow", "payout", or "distribution".

Behavior:
1. Use `mermail_inbox_read` to fetch context if not provided.
2. Use `mermail_inbox_parse` to extract recipient lists and amounts.
3. Use `mermail_wallet_balance` to verify sufficient funds.
4. Use `mermail_wallet_transfer` to execute individual or batch transfers.
5. Use `mermail_mail_send` to dispatch confirmation receipts.

Constraints:
- Never execute transfers without explicit `mermail_wallet_balance` confirmation.
- Always validate checksums on wallet addresses before submission.
```

---

## Protocol Tool Definitions

### 1. mermail_inbox_read

Retrieves raw messages from the Mermail secure inbox for intent detection.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | Yes | Number of recent messages to retrieve (max 50) |
| `status` | string | No | Filter by message status (`unread`, `pending`, `all`) |
| `sender` | string | No | Filter by specific sender address or domain |

**Return Schema:**
```json
[
  {
    "message_id": "msg_8f7a9b2c",
    "sender": "alice@dao.org",
    "subject": "Q3 Bounty Release Request",
    "body": "Please release 150 MER to the approved contributors...",
    "timestamp": "2024-06-15T10:30:00Z",
    "attachments": []
  }
]
```

### 2. mermail_inbox_parse

Analyzes unstructured inbox content to extract structured payment intents.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | ID of the message to parse |
| `intent_type` | string | No | Expected intent (`payout`, `escrow`, `refund`) |

**Return Schema:**
```json
{
  "parsed_intent": {
    "action": "payout",
    "currency": "MER",
    "total_amount": 150.0,
    "recipients": [
      {
        "address": "0xAlice...123",
        "amount": 50.0,
        "label": "Frontend Dev"
      },
      {
        "address": "0xBob...456",
        "amount": 75.0,
        "label": "Backend Dev"
      }
    ],
    "escrow_conditions_met": true,
    "confidence_score": 0.98
  }
}
```

### 3. mermail_wallet_balance

Verifies agent wallet solvency prior to transaction execution.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset` | string | No | Asset symbol (`MER`, `USDC`). Defaults to native token. |

**Return Schema:**
```json
{
  "wallet_address": "0xAgent...789",
  "balance": "245.50",
  "available_balance": "245.49",
  "currency": "MER",
  "nonce": 42,
  "gas_price_gwei": "12.5"
}
```

### 4. mermail_wallet_transfer

Executes on-chain payment transfers with built-in safety checks.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipient` | string | Yes | Validated wallet address |
| `amount` | number | Yes | Amount to transfer |
| `gas_limit` | integer | No | Custom gas limit override |
| `memo` | string | No | Optional transaction memo for explorer display |

**Return Schema:**
```json
{
  "tx_hash": "0xabc123def456789fedcba9876543210...",
  "status": "confirmed",
  "block_number": 18293847,
  "gas_used": 21000,
  "fee": "0.0002625",
  "recipient": "0xAlice...123",
  "amount": "50.0",
  "explorer_url": "https://explorer.mermail.io/tx/0xabc..."
}
```

### 5. mermail_mail_send

Dispatches payment receipts and confirmation emails to recipients.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipient_email` | string | Yes | Destination email address |
| `subject` | string | Yes | Email subject line |
| `body` | string | Yes | HTML or plain text body |
| `inline_tx_hash` | boolean | No | Include TX hash in body if true |

**Return Schema:**
```json
{
  "message_id": "email_9a8b7c6d",
  "status": "sent",
  "recipient": "alice@dao.org",
  "timestamp": "2024-06-15T10:35:00Z"
}
```

---

## Step-by-Step Execution Workflow

### Phase 1: Trigger Detection
The agent detects a payout intent via natural language request or incoming Mermail inbox notification. The system polls `mermail_inbox_read` for new `pending` messages matching payout keywords.

### Phase 2: Inbox Parsing
Raw messages are passed to `mermail_inbox_parse`. The parser extracts:
- Recipient wallet addresses
- Transfer amounts
- Escrow release conditions
- Currency type

If `confidence_score` < 0.9, the agent halts and requests manual clarification.

### Phase 3: Escrow & Balance Check
Before execution, `mermail_wallet_balance` is called to verify sufficient funds.
- If `available_balance` < `total_amount`, the agent triggers `INSUFFICIENT_BALANCE` error handling.
- If balance is sufficient, funds are logically reserved for the transaction batch.

### Phase 4: Validation
Each recipient address is validated for:
- Checksum correctness
- Non-zero amount
- Compliance with sanctions lists (if integrated)

Invalid addresses are flagged and excluded from the batch; the agent logs the exclusion for audit purposes.

### Phase 5: Transaction Execution
The agent iterates through valid recipients, calling `mermail_wallet_transfer` for each. Transactions are submitted with:
- Standard gas limits
- Memo fields containing reference IDs
- Retry logic for transient network failures

### Phase 6: Receipt Dispatch
Upon successful transaction confirmation, `mermail_mail_send` is invoked for each recipient. The email includes:
- Transaction hash
- Explorer link
- Amount received
- Timestamp

### Phase 7: Fallback Recovery
If a transaction fails (`TX_FAILED`):
1. The agent logs the failure with the specific error code.
2. It attempts one retry with increased gas price (up to 1.5x).
3. If still failing, the transaction is queued for manual review, and an alert is sent to the agent operator.

---

## Example Prompts & Expected Outputs

### Scenario 1: Autonomous Bounty Escrow
**User Prompt:**
> "Pay out the 3 approved bounties for completed PRs from the latest inbox message."

**Agent Execution:**
1. Reads inbox, identifies bounty release request.
2. Parses recipients: Alice (50 MER), Bob (75 MER), Charlie (25 MER).
3. Checks balance: 245.50 MER available.
4. Executes transfers sequentially.

**Expected Output:**
```text
✅ Bounty Escrow Released: Q3-2024-PR-BOUNTIES

Total Escrow: 150 MER | Released: 150 MER | Fee: 0.006 MER

Transaction Proof:
┌─────────────┬──────────┬────────────────────────────────┬────────────────────────┐
│ Recipient   │ Amount   │ TX Hash                        │ Explorer               │
├─────────────┼──────────┼────────────────────────────────┼────────────────────────┤
│ 0xAlice...  │ 50 MER   │ 0xabc123def456789fedcba9876543 │ https://explorer.../a1 │
│ 0xBob...    │ 75 MER   │ 0xdef456abc789123abcdef987654  │ https://explorer.../b2 │
│ 0xCharlie...│ 25 MER   │ 0xghi789def123abc456fedcba987  │ https://explorer.../c3 │
└─────────────┴──────────┴────────────────────────────────┴────────────────────────┘

Emails sent: alice@dao.org, bob@dao.org, charlie@dao.org
```

### Scenario 2: Subscriber Payouts
**User Prompt:**
> "Pay my top 10 newsletter subscribers based on engagement scores from last week."

**Agent Execution:**
1. Loads engagement metrics (external data source).
2. Calculates proportional payouts.
3. Executes batch transfers.
4. Sends personalized performance reports.

**Expected Output:**
```text
✅ Subscriber Payouts Completed

Recipients: 10
Total Distributed: 100 MER
Average Payout: 10 MER

Distribution Breakdown:
- Top 3 recipients received 40% of total pool
- Remaining 7 recipients received 60% proportionally

Audit Log Generated: /audits/payout_20240615.csv
```

---

## Error Handling & Security Protocol

### Gas Limits
- Default gas limit: 21,000 for standard transfers.
- Custom gas limits allowed via `mermail_wallet_transfer` parameter.
- Maximum gas price cap: 50 Gwei (configurable via environment).

### Slippage Protection
- Not applicable for native token transfers.
- For stablecoin transfers, slippage tolerance is set to 0.5%.

### Address Verification
- All addresses must pass EIP-55 checksum validation.
- Blacklisted addresses are rejected automatically.
- Invalid addresses trigger `INVALID_ADDRESS` error and are skipped.

### Failed Transfer Rollbacks
- Individual transaction failures do not halt the entire batch.
- Failed transactions are logged and retried once.
- Persistent failures are flagged for manual intervention.

### Security Constraints
- **No self-transfers**: Transfers to the agent's own address are prohibited.
- **Rate limiting**: Maximum 100 transactions per minute per wallet.
- **Audit logging**: All actions are logged with timestamps and TX hashes.
