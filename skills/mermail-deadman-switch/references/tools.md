# Mermail Dead Man's Switch - Tool Mapping Reference

This document specifies the exact integration between the Dead Man's Switch workflow and the official Mermail MCP tool catalog (`https://console.mermail.app/mcp`), verified against the live JSON-RPC `tools/list` schema.

---

## 1. Mermail Native Mailbox Tools (Read-Only)

### `list_emails`
- **Purpose:** Scoped mailbox discovery to detect incoming messages from the owner (`OWNER_EMAIL`).
- **Required Parameters:** `mailboxId`
- **Query Filter Parameters:**
  ```json
  {
    "mailboxId": "CUSTODIAN_MAILBOX_ID",
    "query": {
      "folder": "inbox",
      "limit": 10,
      "sortColumn": "date",
      "sortDirection": "DESC",
      "metadata_only": false,
      "agent_safe_content": true
    }
  }
  ```

### `get_email`
- **Purpose:** Retrieve the sanitized body and headers of a candidate email suspected of containing a heartbeat.
- **Required Parameters:** `mailboxId`, `emailId`
- **Query Parameters:**
  ```json
  {
    "mailboxId": "CUSTODIAN_MAILBOX_ID",
    "emailId": "EMAIL_UUID",
    "query": {
      "agent_safe_content": true,
      "metadata_only": false
    }
  }
  ```
  *(The `agent_safe_content: true` parameter strips unsafe technical headers, prevents indirect prompt injection, and normalizes plain text).*

### `search_emails`
- **Purpose:** Target-search messages by sender or subject substring.
- **Required Parameters:** `mailboxId`
- **Query Parameters:**
  ```json
  {
    "mailboxId": "CUSTODIAN_MAILBOX_ID",
    "query": {
      "from": "owner@mermail.app",
      "subject": "[CHECK-IN]",
      "folder": "inbox",
      "limit": 5,
      "agent_safe_content": true
    }
  }
  ```

---

## 2. Mermail Native Dispatch Tools (External Effects)

### `send_email` (Grace Period Warning Notice)
- **Purpose:** Dispatch urgent life-check warning to the principal upon interval expiration.
- **Required Parameters:** `mailboxId`, `body`
- **Payload:**
  ```json
  {
    "mailboxId": "CUSTODIAN_MAILBOX_ID",
    "body": {
      "from": "custodian@mermail.app",
      "to": "owner@mermail.app",
      "subject": "[URGENT] Proof of Life Check-in - Dead Man's Switch",
      "text": "Activity confirmation required within 48 hours to avoid contingency protocol activation."
    }
  }
  ```

### `send_email` (Irrevocable Contingency Notice)
- **Purpose:** Deliver encrypted directives, secret share vault IDs, and settlement receipts to the designated beneficiary.
- **Required Parameters:** `mailboxId`, `body`
- **Payload:**
  ```json
  {
    "mailboxId": "CUSTODIAN_MAILBOX_ID",
    "body": {
      "from": "custodian@mermail.app",
      "to": "beneficiary@mermail.app",
      "subject": "[CONTINGENCY ACTIVATION] Dead Man's Switch Protocol Executed",
      "text": "Certified irrevocable execution of digital contingency directives and asset release."
    }
  }
  ```

---

## 3. Financial Execution Layer (Solana Agent Wallet / PayBox)

The Dead Man's Switch orchestrates on-chain asset settlement through the Solana Agent Wallet / PayBox protocol.

### `paybox_request_transfer`
- **Purpose:** Dispatch emergency rescue funds (e.g., `0.05 SOL`) from the delegated custodian wallet directly to the beneficiary's public address on Solana Devnet/Mainnet upon irrevocable trigger.
- **Payload Specification:**
  ```json
  {
    "credential": "sol-default",
    "recipient": "BENEFICIARY_SOL_WALLET",
    "amount_decimal": 0.05,
    "memo": "DMS_EMERGENCY_RESCUE_TRANSFER"
  }
  ```
- **Fallback / Verification:** Every financial dispatch provides public transaction receipts verifiable via the Solana Explorer:
  `https://explorer.solana.com/address/<BENEFICIARY_WALLET>?cluster=devnet`
