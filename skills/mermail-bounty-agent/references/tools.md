# Mermail Bounty Agent Tools

This skill orchestrates tools owned by official Mermail domain skills (`mermail-manage-inbox`, `mermail-compose-email`, `mermail-administer-workspace`, and `mermail-agent-wallet`). It does not define proprietary MCP tools.

Always pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Prefer the mailbox `public_id` as `mailboxId`.

## Inbound Email & Triage Tools

| Tool | Owning Domain | Purpose | Risk Level |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Identify the security/bounty mailbox public ID | Read |
| `list_emails` | `mermail-manage-inbox` | List unread vulnerability disclosure emails | Read |
| `search_emails` | `mermail-manage-inbox` | Search for specific bug bounty reports or CVEs | Read |
| `get_email` | `mermail-manage-inbox` | Fetch the full report body, headers, and metadata | Read |
| `download_attachment` | `mermail-manage-inbox` | Inspect proof-of-concept files or encrypted payloads | Read |
| `create_custom_label` | `mermail-manage-inbox` | Create status labels (`bounty/triaged`, `bounty/paid`) | Low |
| `update_email` | `mermail-manage-inbox` | Apply custom labels or mark reports as triaged | Low |

## Communication & Notification Tools

| Tool | Owning Domain | Purpose | Risk Level |
| --- | --- | --- | --- |
| `save_draft` | `mermail-compose-email` | Save an acknowledgment, clarification, or receipt draft | Low |
| `reply_to_email` | `mermail-compose-email` | Dispatch approved settlement receipts or advisory notices | External-Effect |

## Agent Wallet & PayBox Settlement Tools

| Tool | Owning Domain | Purpose | Risk Level |
| --- | --- | --- | --- |
| `get_paybox_connection` | `mermail-agent-wallet` | Verify Agent Wallet OAuth connection is ACTIVE | Read |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Query treasury USDC and SOL balances on Solana | Read |
| `paybox_request_transfer` | `mermail-agent-wallet` | Propose on-chain USDC bounty payout to researcher | Wallet-Destructive (Requires User Signature) |
| `paybox_get_request` | `mermail-agent-wallet` | Poll transfer status and extract on-chain `tx_hash` | Read |

## Tool Argument Examples

### Searching Vulnerability Disclosures
```json
{
  "mailboxId": "8f4e2a1b-3c5d-4e9f-8a7b-1c2d3e4f5a6b",
  "query": {
    "folder": "INBOX",
    "isRead": false,
    "limit": 10
  }
}
```

### Proposing Bounty Transfer via PayBox
```json
{
  "chain": "solana",
  "asset": "USDC",
  "recipient": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "amount": "2500000000",
  "memo": "Bug Bounty Reward - Report #SEC-8821"
}
```

### Replying with Settlement Receipt
```json
{
  "emailId": "msg_01J9X8K2M4P6Q8R0S2T4U6V8W",
  "body": {
    "from": "security@company.com",
    "subject": "Re: [CRITICAL] Reentrancy in StakingVault - Bounty Resolved #SEC-8821",
    "text": "Hello Whitehat,\n\nYour reported vulnerability (#SEC-8821) has been confirmed and patched. A bounty of 2,500 USDC has been settled to your Solana address:\n\nSolana Tx: https://solscan.io/tx/5KngQZ3r7jT7M9F4Z... \n\nThank you for responsibly securing our protocol!\n\nSecurity Operations Team",
    "html": "<p>Hello Whitehat,</p><p>Your reported vulnerability (<strong>#SEC-8821</strong>) has been confirmed and patched. A bounty of <strong>2,500 USDC</strong> has been settled to your Solana address:</p><p><strong>Solana Tx:</strong> <a href=\"https://solscan.io/tx/5KngQZ3r7jT7M9F4Z...\">View on Solscan</a></p><p>Thank you for responsibly securing our protocol!</p><p><em>Security Operations Team</em></p>"
  }
}
```
