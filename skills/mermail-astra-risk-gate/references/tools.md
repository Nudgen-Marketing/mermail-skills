# Tools — mermail-astra-risk-gate

Prefer **existing** Mermail inbox read/reply tools owned by `mermail-agent-inbox` / `mermail-manage-inbox`. Do **not** claim exclusive ownership of those tools in `tool-coverage.json` if they already have owners — route via router or document use only.

## Expected capabilities
- Read Mermail inbox / thread containing a Solana CA
- Reply in-thread with gate result
- Optional: resolve public Solana token metadata via whatever research tools the host agent already has

## Out of scope
- Agent Wallet spends / swaps (`paybox_*`, wallet writes)
- Seed phrase or private key handling
