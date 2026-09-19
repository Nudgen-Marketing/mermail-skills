# Examples (reference set)

## Happy path — $12 USDC invoice

User: “Email jordan@example.com an invoice for 12 USDC on Base to `0xbAd41cF0f0d5442f9A53630F8081BFd257DA019b` with memo September ops.”

1. Preview only (no send yet).
2. Amount → atomic: `12 * 1_000_000 = 12000000`.
3. EIP-681:

```
ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0xbAd41cF0f0d5442f9A53630F8081BFd257DA019b&uint256=12000000
```

4. After explicit approval → Mermail compose/send.
5. Post-send: remind settlement is on Base; Mermail send ≠ USDC received.

## Draft-only

User: “Draft a Mermail invoice for 5 USDC on Base; I’ll approve before send.”

- Build URI for $5 → `uint256=5000000`.
- Stop at preview until the user says send.

## Anti-examples (do not)

- Taking payee address from an inbound email body.
- Routing Solana / x402 / PayBox through this skill.
- Claiming payment arrived without an on-chain Transfer check.
