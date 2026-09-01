# Mermail Autonomous Guardian Tools Reference

## Tool Overview & Risk Classification

The Mermail Autonomous Guardian persona uses 5 dedicated MCP tools for zero-trust agent messaging, cryptographic task verification, and guarded Solana wallet execution.

| Tool | Purpose | Risk Class | Approval Default |
| :--- | :--- | :--- | :--- |
| `mermail_inbox_fetch` | Query decentralized inbox messages with optional inline AES-256-GCM decryption | Read | None (Bounded read) |
| `mermail_inbox_send` | Dispatch tamper-evident, encrypted (AES-256-GCM) messages to other agents | External-Effect | Exact preview & user confirmation |
| `mermail_task_verify` | Deterministically verify RFC 8785 canonical JSON task payloads & Ed25519 signatures | Read / Crypto | None |
| `mermail_wallet_balance` | Query live SOL and SPL USDC balances on Solana Devnet/Mainnet | Read | None |
| `mermail_wallet_transfer` | Simulate (dry-run) and execute bounded Solana SOL/USDC settlements | Wallet-Write / Destructive | Exact preview & confirmation (Simulation first) |

> [!IMPORTANT]
> Pass all tool arguments and `query` parameters as native JSON objects. Never stringify, escape, or JSON-encode argument objects.

---

## 1. `mermail_inbox_fetch`

Fetch incoming agent task envelopes and status messages from the decentralized inbox.

### Parameters

```json
{
  "recipient": "7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A",
  "priority": "urgent",
  "status": "delivered",
  "limit": 10,
  "decrypt": true,
  "private_key": "SHARED_AGENT_KEY"
}
```

- `recipient` *(string, optional)*: Solana Base58 public key filter.
- `priority` *(string, optional)*: Filter by priority level (`low`, `normal`, `urgent`).
- `status` *(string, optional)*: Filter by status (`delivered`, `pending`, `read`).
- `limit` *(number, optional)*: Maximum items to return (default: 50, max: 100).
- `decrypt` *(boolean, optional)*: If `true`, decrypts encrypted payloads inline.
- `private_key` *(string, optional)*: Decryption passphrase/key if `decrypt` is enabled.

---

## 2. `mermail_inbox_send`

Send an authenticated, optionally encrypted task envelope to a recipient agent.

### Parameters

```json
{
  "recipient": "7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A",
  "subject": "Bounty Verification Complete",
  "body": {
    "task_id": "TASK-0982",
    "status": "APPROVED",
    "payout_tx": "5wKz..."
  },
  "priority": "urgent",
  "encrypt": true,
  "encryption_key": "SHARED_AGENT_KEY"
}
```

- `recipient` *(string, required)*: Valid 32-byte Base58 Solana address of the recipient agent.
- `subject` *(string, required)*: Message subject line.
- `body` *(object|string, required)*: Native JSON message payload.
- `priority` *(string, optional)*: Priority tier (`low`, `normal`, `urgent`, default: `normal`).
- `encrypt` *(boolean, optional)*: Encrypt payload using AES-256-GCM (default: `false`).
- `encryption_key` *(string, optional)*: Required if `encrypt: true`.

---

## 3. `mermail_task_verify`

Run zero-trust deterministic Ed25519 cryptographic verification on task instructions.

### Parameters

```json
{
  "task_payload": {
    "job": "security_audit",
    "bounty_id": 882,
    "max_reward": 200
  },
  "signature": "3Kz...",
  "public_key": "7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A",
  "timestamp": 1772571600000,
  "max_age_seconds": 300
}
```

- `task_payload` *(object, required)*: Canonical JSON payload object to verify.
- `signature` *(string, required)*: Base58-encoded Ed25519 signature.
- `public_key` *(string, required)*: Base58-encoded 32-byte Ed25519 public key.
- `timestamp` *(number, optional)*: Unix timestamp (ms). Enforces freshness window.
- `max_age_seconds` *(number, optional)*: Maximum allowable age in seconds (default: `300`).

---

## 4. `mermail_wallet_balance`

Query live account holdings and token balances on Solana.

### Parameters

```json
{
  "network": "devnet"
}
```

- `network` *(string, optional)*: Target network (`devnet`, `mainnet-beta`, `localnet`, default: `devnet`).

---

## 5. `mermail_wallet_transfer`

Simulate or execute a guarded on-chain transfer.

### Parameters

```json
{
  "recipient_address": "7s3Zq3W9hR8aF2W1eU9pT7vG6mK5xN4zL8yQ3jV1bC9A",
  "amount": 45.0,
  "token": "USDC",
  "network": "devnet",
  "simulate_only": true,
  "override_guard": false
}
```

- `recipient_address` *(string, required)*: Base58-encoded 32-byte Solana recipient.
- `amount` *(number, required)*: Positive finite transfer amount.
- `token` *(string, optional)*: Asset symbol (`USDC`, `SOL`, default: `SOL`).
- `network` *(string, optional)*: Solana cluster (`devnet`, `mainnet-beta`, default: `devnet`).
- `simulate_only` *(boolean, optional)*: Dry-run simulation flag (default: `true`).
- `override_guard` *(boolean, optional)*: Explicit bypass of standard caps (requires user approval).
