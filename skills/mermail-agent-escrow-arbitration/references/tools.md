# Mermail Agent Escrow & Arbitration Desk: MCP Tools Reference

This document specifies the exact Mermail Model Context Protocol (MCP) tools utilized by the Escrow & Arbitration Desk.

## 1. Inbox & State Management Tools

### `list_emails`
- **Description**: Ingests new unread emails from the Escrow Desk's inbox.
- **Usage**: Scans for inbound requests (`[ESC-NEW]`), funding confirmations, deliverable attachments, or dispute notices.
- **Safety Rating**: `SAFE` (Read-only query).

### `search_emails`
- **Description**: Queries emails across folders using search syntax (e.g. `subject:ESC-2026-001`).
- **Usage**: Core engine of the "Inbox-as-Database" paradigm. Retrieves the complete chronological event stream for any given Deal ID without external databases.
- **Safety Rating**: `SAFE` (Read-only query).

### `get_email`
- **Description**: Fetches the complete email content, headers, timestamps, and deliverable attachments.
- **Usage**: Ingests provider deliverables (code, zip archives, documents) and evaluates evidence during disputes.
- **Safety Rating**: `SAFE` (Read-only query).

### `send_mail`
- **Description**: Dispatches outbound email notifications to Payer and Provider agents.
- **Usage**: Emits Contract Initialized notices, Deposit Confirmations, Deliverable Review Notices, and Arbitration Verdicts.
- **Safety Rating**: `SAFE` when communicating within pre-registered deal participant addresses; `HIGH_RISK` when contacting unknown external domains.

### `draft_reply`
- **Description**: Prepares an unreleased reply draft within the deal thread for operator review.
- **Usage**: Used during complex arbitration edge cases or when escrow values exceed human confirmation thresholds (> 500 USDC).
- **Safety Rating**: `SAFE` (Drafts do not trigger external network transmissions).

### `triage_inbox`
- **Description**: Categorizes incoming emails by priority and operational intent.
- **Usage**: Sorts incoming emails into `NEW_ESCROW_REQUEST`, `DEPOSIT_RECEIPT`, `DELIVERABLE_SUBMISSION`, or `DISPUTE_CLAIM`.
- **Safety Rating**: `SAFE`.

---

## 2. Agent Wallet & PayBox Custody Tools

### `get_paybox_connection`
- **Description**: Inspects the Agent Wallet connection state and confirms delegated execution privileges.
- **Usage**: **Mandatory Pre-flight Tool**. Must be invoked prior to any PayBox financial operation. Never executes PayBox tools without verifying active connection.
- **Parameters**: None.
- **Safety Rating**: `SAFE` (Read-only probe).

### `paybox_request_transfer`
- **Description**: Initiates an on-chain transfer from the Desk's Agent Wallet to a counterparty wallet.
- **Usage**: Releases escrowed funds to the Provider agent upon satisfaction, or executes refunds to the Payer upon successful dispute arbitration.
- **Payload Example**:
  ```json
  {
    "recipient": "agent-provider.sol",
    "amount": "50.00",
    "asset": "USDC",
    "chain": "solana",
    "memo": "ESC-2026-001: Mutual Release"
  }
  ```
- **Safety Rating**: `HIGH_RISK` (Requires verified deal state criteria or operator authorization token).

### `paybox_pay_x402`
- **Description**: Executes automated HTTP 402 micro-payments for third-party verification services.
- **Usage**: Used to query automated external code validation, antivirus scanning, or oracle attestations during arbitration.
- **Safety Rating**: `MEDIUM_RISK` (Capped at 1.00 USDC per verification query).
