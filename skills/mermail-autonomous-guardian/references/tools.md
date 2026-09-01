# Mermail Autonomous Guardian Tools Reference

| Tool | Purpose | Risk Class |
| :--- | :--- | :--- |
| `mermail_inbox_fetch` | Query decentralized inbox with AES-256-GCM decryption | Read |
| `mermail_inbox_send` | Send encrypted tamper-evident task messages | External-Effect |
| `mermail_task_verify` | Verify Ed25519 signatures with anti-replay timestamp checks | Read / Crypto |
| `mermail_wallet_balance` | Query live SOL and SPL USDC balances | Read |
| `mermail_wallet_transfer` | Simulate and execute bounded Solana settlements | Wallet-Write |
