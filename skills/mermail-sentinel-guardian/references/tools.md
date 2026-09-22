# Mermail Sentinel Guardian Tools Reference

This document details the Mermail MCP tools utilized by the `mermail-sentinel-guardian` skill.

## 1. Incident Escalation & Inbox Tools

### `send_email`
- **Purpose**: Dispatches high-priority incident escalation notifications to designated security responders.
- **Required Parameters**:
  - `to`: Array of verified recipient email addresses.
  - `subject`: Standardized incident header (e.g., `[CRITICAL ALERT] On-Chain Anomaly Detected on Base: Event #16326`).
  - `body`: Markdown-formatted technical breakdown with transaction hashes and cryptographic proof.
- **Safety**: Requires external-effect approval unless pre-authorized within automated guardian policy.

### `get_email` & `get_email_context`
- **Purpose**: Fetches operator replies, extracting cryptographic approval payloads and signatures.
- **Usage**: Always read thread context to ensure continuity and avoid acting on spoofed message headers.

### `search_emails`
- **Purpose**: Polls for incoming authorization responses matching the incident nonce.

## 2. Agent Wallet Tools (Defensive Mitigation)

### `get_agent_wallet`
- **Purpose**: Inspects agent wallet address, status, and connected network.

### `get_agent_wallet_portfolio`
- **Purpose**: Checks real-time token balances and available liquidity before drafting fund safeguarding proposals.

### `create_agent_wallet_transfer_proposal`
- **Purpose**: Creates an immutable, structured transfer proposal to evacuate funds to an authorized cold vault.
- **Required Parameters**:
  - `recipient`: Pre-allowlisted cold storage or multi-sig contract address.
  - `token`: Contract address of token to protect (or native gas token).
  - `amount`: Exact atomic amount to sweep.
- **Safety**: Proposals do not execute immediately; they generate an authorization handoff.

### `submit_agent_wallet_transfer`
- **Purpose**: Submits the final signed transfer proposal to the network upon receiving valid operator approval.
- **Safety**: Classified as wallet-destructive; strictly requires human confirmation token.
