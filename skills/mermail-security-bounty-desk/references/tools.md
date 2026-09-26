# Security Bounty Desk Tools

This workflow **uses** tools owned by official Mermail skills (`mermail-manage-inbox`, `mermail-compose-email`, `mermail-agent-wallet`, `mermail-administer-workspace`). Do not add them as owned tools in `tool-coverage.json`.

There are no `triage_vulnerability`, `calculate_bounty`, or `pay_bounty` tools. Map those intents to real Mermail operations below.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier exposed by the current environment (`create_agent_wallet_transfer_proposal` or `Mermail:create_agent_wallet_transfer_proposal`). Prefer mailbox `public_id` as `mailboxId`.

## Intent Mapping

| Intent | Real Operation | Owner Domain |
| --- | --- | --- |
| Discover security mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Search disclosure reports | `search_emails`, `list_emails` | `mermail-manage-inbox` |
| Inspect report details & PoC | `get_email`, `get_email_context` | `mermail-manage-inbox` |
| Download exploit attachments | `download_attachment` (≤1 MiB) | `mermail-manage-inbox` |
| Check treasury balance | `get_agent_wallet_portfolio` | `mermail-agent-wallet` |
| Inspect wallet credentials | `list_agent_wallet_credentials` | `mermail-agent-wallet` |
| Propose bounty payout | `create_agent_wallet_transfer_proposal` | `mermail-agent-wallet` |
| Check proposal status | `get_agent_wallet_request` / `paybox_get_request` | `mermail-agent-wallet` |
| Draft acknowledgment & receipt | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Send approved acknowledgment | `reply_to_email` (`body.from` + `html`/`text`) | `mermail-compose-email` |
| Label & organize report | `create_custom_label`, `move_email` | `mermail-manage-inbox` |

## Tool Usage Details

### 1. Inbound Triage (`mermail-manage-inbox`)

Search for incoming vulnerability submissions:
```json
{
  "mailboxId": "sec-mailbox-uuid",
  "query": {
    "sortColumn": "date",
    "sortDirection": "DESC",
    "status": "unread"
  }
}
```

Read report safely:
```json
{
  "mailboxId": "sec-mailbox-uuid",
  "emailId": "msg_vuln_123",
  "metadata_only": false
}
```

### 2. Treasury Verification & Proposals (`mermail-agent-wallet`)

Inspect treasury balances before committing to a reward:
```json
{
  "walletId": "agent-treasury-uuid"
}
```

Stage the reward transfer proposal (Human-in-the-Loop):
```json
{
  "walletId": "agent-treasury-uuid",
  "recipientAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "token": "USDC",
  "network": "solana",
  "amount": "250.00",
  "memo": "Bounty SEC-2026-0922-01: High Severity Vault Re-entrancy"
}
```

### 3. Acknowledgment & Settlement Draft (`mermail-compose-email`)

Draft the official response citing tracking ID and proposal status:
```json
{
  "mailboxId": "sec-mailbox-uuid",
  "threadId": "thread_vuln_123",
  "body": {
    "to": "researcher@security.io",
    "subject": "Re: [VULN-REPORT] Critical re-entrancy in StakingPool - [SEC-2026-0922-01]",
    "body": "Thank you for your responsible disclosure. The team has verified the re-entrancy vulnerability in StakingPool.sol (CVSS 8.2 High). In accordance with our Bug Bounty Policy, a reward of 250 USDC has been approved and staged for on-chain remittance (Proposal ID: prop_987abc). A fix is currently undergoing testing on staging."
  }
}
```
