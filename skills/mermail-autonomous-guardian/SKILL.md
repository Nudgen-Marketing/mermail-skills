---
name: mermail-autonomous-guardian
description: Hardened cryptographic task verification, anti-replay guards, decentralized inbox messaging, and zero-trust autonomous Solana settlements for AI agents using Mermail MCP tools. Use when an autonomous agent needs to inspect inbox tasks, verify Ed25519 signatures, protect against replay/overspend attacks, or execute safe Solana Devnet/Mainnet payments within strict caps.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
    emoji: "🛡️"
---

# Mermail Autonomous Guardian

## Overview

The **Mermail Autonomous Guardian** skill empowers autonomous AI agents with an institutional-grade security, cryptographic verification, and safe settlement layer on Solana. Operating over standard Model Context Protocol (MCP) transports (`stdio` / `streamable-http`), it provides tamper-evident task verification, anti-replay protection, and zero-trust wallet execution.

## Preferred Deliverables

- Grounded cryptographic verification of incoming task payloads and Ed25519 signatures.
- Replay attack rejection for task payloads exceeding timestamp freshness windows (default: 300s).
- Bounded, simulated-first Agent Wallet transactions with explicit per-transaction ($100 USDC / 1.0 SOL) and daily spend caps ($500 USDC / 5.0 SOL).
- End-to-end encrypted (X25519 / AES-256-GCM) agent-to-agent task handoffs.

## Core Workflow

1. **Intake & Verification**:
   - Query incoming agent tasks via `mermail_inbox_fetch` or mailbox tools.
   - Run cryptographic verification on every payload with `mermail_task_verify` before taking any external or on-chain action.
   - Validate timestamp freshness to mitigate signature reuse (replay attacks).

2. **Policy Enforcement & Simulation**:
   - Inspect wallet balances and token holdings via `mermail_wallet_balance`.
   - Check proposed payout against spending caps ($100 USDC per tx, $500 USDC daily).
   - Simulate the transfer with `mermail_wallet_transfer` (`simulate_only: true`) to verify gas fees, balance coverage, and destination validity.

3. **Settlement & Dispatch**:
   - Execute authorized settlement only when within policy parameters.
   - Dispatch encrypted completion envelope back to coordinator via `mermail_inbox_send`.

## Write Safety Invariants

- **Nonce Freshness**: Strict 96-bit (12-byte) nonces with 128-bit authentication tags for AES-256-GCM payloads.
- **Anti-SSRF Protection**: All RPC and external endpoint inputs strictly block private RFC 1918 subnets and cloud metadata (`169.254.169.254`).
- **Zero-Trust Destination**: Transfer destinations must be valid 32-byte Base58 Solana public keys.

## Example Requests

- "Verify the signature on bounty task #TASK-0982 before processing payout."
- "Check my Mermail agent wallet balance and simulate a 25 USDC settlement to the contributor."
- "Send an encrypted status update to the coordinator agent regarding audit completion."
- "Run security gauntlet attack tests against the autonomous settlement loop."
