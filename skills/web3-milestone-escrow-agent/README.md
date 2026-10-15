# GitHub Verified Milestone Settlement

A Mermail Agent Skill for verifying software-development milestones against GitHub pull-request merge status before an approved USDC settlement.

## Folder

```text
web3-milestone-escrow-agent/
├── SKILL.md
├── README.md
├── agents/
│   └── openai.yaml
└── references/
    ├── security.md
    ├── tools.md
    └── workflows.md
```

## What it does

```text
Mermail Inbox
     |
     v
Milestone Request
     |
     v
Parse GitHub Repo + PR
     |
     v
GitHub PR Verification
     |
     +---- not merged ----> STOP
     |
     v
Validate Payment Terms
     |
     v
Exact Settlement Preview
     |
     v
User Approval
     |
     v
Mermail Agent Wallet / PayBox
     |
     v
USDC Transfer
     |
     v
Authoritative Result
     |
     v
Optional Confirmation Email
```

## Important

This skill does not invent GitHub or wallet MCP tools.

It does not provide custody, smart-contract escrow, a settlement ledger, or background monitoring. Without a connected durable settlement record supporting an exclusive reservation, it stops at a verified preview and does not transfer. A merged PR does not by itself prove agreement acceptance or authorize payment.

GitHub verification uses the GitHub integration/API exposed by the host.

Wallet settlement uses the current Mermail Agent Wallet/PayBox capability, documented by Mermail as `paybox_request_transfer`, when that capability is available and approved.

## Demo

Use a test repository. Default to a no-transfer preview. Only demonstrate a transfer when the host supports the test network, the durable duplicate gate is available, and the user separately authorizes the exact test payment; never substitute mainnet funds.

The video should visibly demonstrate:

1. The trigger prompt.
2. Mermail inbox access.
3. Extraction of the milestone request.
4. GitHub PR verification.
5. The merged result.
6. Exact payment preview.
7. Required wallet approval.
8. Testnet payment execution.
9. Authoritative transaction/payment result.
10. Confirmation message.

Do not fabricate logs or transaction hashes.

<!-- GitHub milestone verification test -->
