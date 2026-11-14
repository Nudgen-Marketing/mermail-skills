# Mermail Digital Inheritance Switch Agent Skill

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Superteam Bounty](https://img.shields.io/badge/Superteam-Bounty%20Project-purple.svg)](https://superteam.fun/earn/listing/build-and-demo-a-mermail-agent-skill)
[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet%20Verified-green.svg)](https://explorer.solana.com/address/E4dA4YrWnMgFv7NNseHjw8r2yikArPGiEnrxX4YYExdX?cluster=devnet)
[![Tests: 11/11 Passed](https://img.shields.io/badge/Tests-11%2F11_Passed-success.svg)](./tests/test-runner.mjs)

> Autonomous Digital Contingency, Multi-Asset Inheritance, and Asset Rescue Protocol powered by Mermail MCP and Solana (Anchor & PayBox).

---

## Overview

In Web3, private keys, encrypted backup shards, and digital directives are irrevocably lost if an owner becomes incapacitated or permanently unresponsive. Traditional centralized custodians (notaries, legacy banks) are slow, expensive, and introduce trusted third-party risk. Conversely, smart contracts alone cannot easily parse real-world communication or send human-readable notices to beneficiaries.

`mermail-deadman-switch` transforms an AI agent into an autonomous, non-custodial contingency notary leveraging:
1. **Mermail Inbox MCP (`list_emails`, `get_email`, `send_email`)**: For private, spam-filtered identity, proof-of-life check-in monitoring, and confidential Shamir Shard #2 delivery.
2. **PayBox / Agent Wallet (`paybox_request_transfer`)**: For programmatic, policy-bounded asset rescue transfers on Solana Devnet/Mainnet without exposing raw private keys.
3. **Passive Mixed Liveness**: Automatic timer refresh via Solana RPC whenever the owner transacts on-chain.
4. **Shamir's Secret Sharing (2-of-3)**: Mathematical vault key fragmentation in Galois Field $\text{GF}(2^8)$.
5. **Solana Anchor Smart Contract (`mermail_deadman_vault`)**: PDA-governed vault (`[b"deadman_vault", owner]`, Program ID: `E4dA4YrWnMgFv7NNseHjw8r2yikArPGiEnrxX4YYExdX`) with SPL Token (USDC) escrow, Pyth Network price feeds, and legal oracle bypasses.

---

## Multi-Tiered Deterministic Lifecycle

```
[ARMED] ──(T1: Inactivity)──► [TIER 1: Soft Ping] ──(T2: Warning)──► [TIER 2: Urgent Alert]
   ▲                                                                          │
   │                                                                          ▼
   │                                                             [TIER 3: Guardian Escalation]
   │                                                                    │              │
   │                                                 (Guardian Hold)    │              │ (Grace Expired)
   │                                                        ▼           │              ▼
   └──(Valid Ed25519 Heartbeat)──────────────────── [GUARDIAN_HOLD] ────┘        [TRIGGERED (Irrevocable)]
```

- **[ARMED]**: Continuous standby. Refreshed passively by Solana on-chain activity or actively by Ed25519-signed emails.
- **[TIER 1: Soft Ping (Day 30)]**: Private, non-alarming reminder dispatched to the owner with Pyth Network USD valuations.
- **[TIER 2: Urgent Notice (Day 37)]**: Multi-channel warning alerting of impending contingency procedures.
- **[TIER 3: Guardian Escalation (Day 45)]**: Escalates to trusted guardians. Guardians can invoke `applyGuardianHold` (14-day hold, max 60 days cumulative) during medical emergencies.
- **[TRIGGERED (Irrevocable - Day 60)]**: Upon full grace expiration:
  - Dispatches Shamir Shard #2 and AI Notary claim guidance to the beneficiary via Mermail.
  - Executes controlled asset rescue micro-transfer on Solana Devnet via PayBox.
  - Unlocks autonomous multi-asset on-chain inheritance claim (SOL + USDC) via the Anchor Smart Contract PDA.

---

## Repository Structure

```text
skills/mermail-deadman-switch/
├── SKILL.md                   # Core skill definition and dual-core execution contract (<500 lines)
├── agents/
│   └── openai.yaml            # OpenClaw / OpenAI agent manifest with Mermail MCP dependencies
├── references/
│   ├── tools.md               # Strict MCP tool mapping (read-only, email, and PayBox writes)
│   ├── security.md            # Zero-trust threat model and prompt injection defense
│   └── protocol-guide.md      # Operational manual for contingency deployment
└── tests/
    ├── scenarios.json         # 11 structured threat & operational test scenarios
    └── test-runner.mjs        # Autonomous test execution suite
```

---

## Security & Threat Model

- **Dual-Core Decoupling**: State transitions, timers, and mathematical verifications are executed exclusively by the deterministic Kernel; LLMs have zero authority over fund releases, neutralizing Indirect Prompt Injection (IPI).
- **Cryptographic Ed25519 Proof of Life**: Heartbeats require authentic digital signatures matching the owner's Solana keypair, neutralizing spoofed email relays.
- **Threshold Custody**: Breaching the agent or email inbox reveals only 1 of 3 shards, cryptographically preserving vault confidentiality.
- **Anti-Griefing Safeguards**: Guardians cannot indefinitely delay claims due to strict cumulative 60-day limits.
- **Oracle Dispute Window**: 48-hour safety window prevents false or malicious oracle triggers from instantly locking out a living owner.

---

## Verified Evidence

- **Anchor Program ID:** [`E4dA4YrWnMgFv7NNseHjw8r2yikArPGiEnrxX4YYExdX`](https://explorer.solana.com/address/E4dA4YrWnMgFv7NNseHjw8r2yikArPGiEnrxX4YYExdX?cluster=devnet)
- **Live Upgraded Deploy Tx:** [`L98mtYU5jnTTuYeFqZiy6HDAy2ipaQBRiuBtZJGdbFJonTDZRqJdPmufMSo5sZFR1ZMgKEWpBRdTRPin82Bt8Rg`](https://explorer.solana.com/tx/L98mtYU5jnTTuYeFqZiy6HDAy2ipaQBRiuBtZJGdbFJonTDZRqJdPmufMSo5sZFR1ZMgKEWpBRdTRPin82Bt8Rg?cluster=devnet)
- **Live Vault PDA Address:** [`9DpG5ZiHx25Qd5DJemP4CoA1Q4vtdy2WEAxeV31UNQVx`](https://explorer.solana.com/address/9DpG5ZiHx25Qd5DJemP4CoA1Q4vtdy2WEAxeV31UNQVx?cluster=devnet)
- **Custodian / Sender Wallet:** `A6sKW3FgobaiWh6QYgUg3sunn6yPSWtjjEMqyEzv75NG`
- **Beneficiary Settlement Wallet:** `F9tjfnvJUy8EYip947GhYM4YW7kG6U5hDcMFc3DRFbwE`
- **Unit Test Suite:** 11/11 automated scenarios passed (100% pass rate).
- **Red Team Suite:** 8/8 adversarial attack vectors neutralized.

---

## Getting Started

### 1. Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- A Mermail account with MCP enabled (`https://console.mermail.app`)

### 2. Configuration
Copy `.env.example` to `.env` and fill in your test credentials:
```bash
cp .env.example .env
```

### 3. Running the Test Suite
Run the 11 automated security and lifecycle test scenarios:
```bash
npm test
```

### 4. Running Extended Suites
```bash
npm run test:live       # Live Solana Devnet RPC & Mermail Console MCP
npm run test:worker     # Cloudflare Edge Worker serverless simulation
npm run test:contract   # Anchor Smart Contract SPL & Pyth suite
npm run test:redteam    # Adversarial Red Team stress-test suite
npm run test:boundary   # Advanced Boundary & On-Chain Rejection suite
```

---

## License
MIT License. Created by [Totopo27](https://github.com/Totopo27) for the Superteam Earn Bounty.
