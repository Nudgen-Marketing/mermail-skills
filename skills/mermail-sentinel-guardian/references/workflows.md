# Mermail Sentinel Guardian Workflows

```text
+-----------------------+       +-------------------------+       +------------------------+
| On-Chain Anomaly Feed | ----> | Sentinel Guardian Agent | ----> | Mermail MCP: send_email|
+-----------------------+       +-------------------------+       +------------------------+
                                             |                                 |
                                             v                                 v
                                +-------------------------+       +------------------------+
                                |  Operator Authorization | <---- |   Human Security Team  |
                                +-------------------------+       +------------------------+
                                             |
                                             v
                                +-------------------------+
                                |  Mermail Agent Wallet:  |
                                |  Defensive Fund Sweep   |
                                +-------------------------+
```

## Playbook 1: Zero-Value Poisoning Attack Escalation

1. **Trigger**: Sentinel detects 20+ zero-value `transferFrom` events targeting the treasury wallet within 5 blocks.
2. **Action**:
   - Classify threat as `HIGH` (Event Spoofing & Ledger Pollution).
   - Call `send_email` with technical diff and affected token address.
   - No wallet transfer required (passive threat).
   - Log incident as resolved without asset evacuation.

## Playbook 2: Critical Asset Evacuation (Active Invariant Breach)

1. **Trigger**: Sentinel flags an invariant breach (e.g. liquidity pool imbalance or flash loan drain).
2. **Action**:
   - Classify threat as `CRITICAL`.
   - Call `send_email` containing nonce `INC-99482` and recommended cold vault `0xVault...`.
   - Poll for reply using `search_emails`.
   - Ingest reply, verify operator signature matching `INC-99482`.
   - Call `create_agent_wallet_transfer_proposal` for treasury balance.
   - Present submission confirmation to operator.
   - Execute `submit_agent_wallet_transfer` once token is validated.
   - Dispatch confirmation email with on-chain transaction hash.
