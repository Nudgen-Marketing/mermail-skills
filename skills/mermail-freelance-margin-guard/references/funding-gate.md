# Public Funding Gate

Use this optional gate only after the owner has reviewed a valid Margin Packet and selected one fully priced option. Its question is deliberately different from wallet-control proof: **did the exact owner-approved change order receive the exact public settlement required before added work begins?**

The gate never creates a transfer. It observes one transaction through a user-selected HTTPS Base or Solana RPC, verifies it locally, and emits a privacy-minimized receipt.

## Assurance model

The gate binds all of these facts into one deterministic `covenantDigest`:

- the verified Margin Packet digest;
- the selected priced option and exact packet-currency amount;
- the exact settlement chain, token contract or mint, token decimals, amount in atomic units, and destination;
- an explicit owner conversion authority when the packet currency and settlement asset differ;
- the owner approval reference and timestamp;
- an optional expiry and the minimum Base confirmation count; and
- the binding mode.

`public_transaction` is the normal mode. It requires no wallet or PayBox connection. `provider_request` is optional: it additionally precommits one exact PayBox provider request id and requires a terminal `paybox_get_request` result whose transaction hash equals the independently observed chain transaction. Supply that result from an authenticated provider read; the local JSON field `source` does not authenticate a provider response on its own. `get_paybox_invocation` is audit state and is never settlement evidence.

## Build a covenant

Create a terms file only from values explicitly selected by the owner:

```json
{
  "optionId": "paid_change_order",
  "price": { "amount": "487.5", "currency": "USD" },
  "settlement": {
    "chain": "base-sepolia",
    "assetSymbol": "USDC",
    "assetId": "0xTOKEN_CONTRACT",
    "decimals": 6,
    "amount": "487.5",
    "destination": "0xOWNER_SELECTED_RECIPIENT"
  },
  "conversion": {
    "mode": "owner_fixed",
    "sourceRef": "owner-approved USD-to-USDC settlement"
  },
  "binding": { "mode": "public_transaction" },
  "ownerApprovalRef": "change-order-approval-2026-09-22",
  "ownerApprovedAt": "2026-09-22T10:00:00Z",
  "policy": {
    "minimumConfirmations": 2,
    "validUntil": "2026-10-01T00:00:00Z"
  }
}
```

`amount`, prices, and atomic amounts are strings so floating-point rounding cannot silently change financial evidence. Token identity is the contract or mint, not merely the ticker. The gate never assumes USD equals USDC; `owner_fixed` records the owner's exact conversion decision.

Build the covenant:

```bash
node skills/mermail-freelance-margin-guard/scripts/funding-gate.mjs \
  covenant --packet packet.json --terms funding-terms.json > covenant.json
```

The script rejects zero-fee or incompletely priced options, any price outside the selected packet option's range, an ambiguous timestamp, and an expiry that is not after approval. Preview every settlement term and the resulting `covenantDigest`; verification requires the exact digest copied from the owner's approval, not merely a covenant file that can be rehashed after editing.

## Verify a public transaction

After the owner supplies the transaction hash, read it directly from the selected chain:

```bash
node skills/mermail-freelance-margin-guard/scripts/funding-gate.mjs \
  verify --packet packet.json --covenant covenant.json \
  --approved-covenant-digest OWNER_APPROVED_SHA256 \
  --tx TRANSACTION_HASH --rpc-url HTTPS_RPC_URL \
  --used-proofs consumed-proof-ids.json
```

`consumed-proof-ids.json` is required even on the first run, when its content is simply `[]`. After `FUNDED`, append the returned `proofId` before verifying another change order. Missing replay state fails closed.

Supported observations:

- Base and Base Sepolia native transfers;
- exact ERC-20 `transfer(address,uint256)` calls on Base and Base Sepolia, with one matching `Transfer` event and decimals read at the receipt block;
- finalized native SOL transfers on Solana mainnet-beta, devnet, or testnet with an exact net recipient balance increase; and
- finalized SPL Token / Token-2022 transfers whose destination token account belongs to the owner-selected recipient, whose mint matches exactly, and whose net balance increase equals the observed incoming amount.

For deterministic tests or offline comparison, `--chain-observation recorded-observation.json` can replace `--tx` and `--rpc-url`. It can return only `RECORDED_MATCH`, never `FUNDED` or a new public receipt, even if every field matches. Use the live RPC path for an authoritative result. Choose an RPC endpoint you trust: the program validates HTTPS, rejects embedded credentials, local domains and private or reserved IP literals (including IPv4-mapped IPv6), disables redirects, and times out; it does not independently authenticate DNS answers or the RPC operator. For higher assurance, compare the explorer result with a second independent RPC.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `FUNDED` | Exact successful post-approval settlement, required finality, unchanged packet/covenant, and unused proof |
| `APPROVAL_REQUIRED` | The exact covenant digest from the owner's approval was not supplied |
| `REPLAY_STATE_REQUIRED` | The consumed-proof ledger was omitted |
| `RECORDED_MATCH` | An offline observation matches but cannot issue authoritative funding proof |
| `PENDING` | Chain finality or an optional provider request is not terminal |
| `PARTIALLY_FUNDED` | Atomic settlement amount is below the covenant |
| `OVERFUNDED_REVIEW` | Atomic settlement amount is above the exact authorization; manual review required |
| `REPLAY_BLOCKED` | The transaction proof id already funded another recorded covenant |
| `MISMATCH` | Packet/covenant, chain, token, decimals, destination, timing, request id, or transaction linkage differs |
| `UNVERIFIED` | The chain transaction or optional provider request failed or ended without success |

A transaction before `ownerApprovedAt` cannot satisfy the covenant, even when every amount and address happens to match. A transaction after `validUntil` cannot satisfy it either. Store each successful `proofId` and pass the accumulated list on later runs so the same transfer cannot fund two change orders.

## Public receipt and privacy

Only a fresh live RPC read can emit a `FUNDED` receipt. It contains the packet and covenant digests, proof id, exact public settlement fields, `live_rpc` assurance marker, explorer URL, and a receipt digest. The digest is an integrity checksum, not a signature; offline inspection can establish only structural consistency. Authentication therefore re-reads the public transaction and checks the proof id, decimal/atomic relationship, explorer link, relevant token event or recipient balance, timing, finality, and approved covenant binding. The receipt omits email content, project name, raw owner-approval text, and raw provider request id. Publish only after the owner approves disclosure; on-chain destination and amount are already public, but the link to a business change order may still be sensitive.

Verify a saved public receipt independently:

```bash
node skills/mermail-freelance-margin-guard/scripts/funding-gate.mjs \
  receipt-verify --receipt public-funding-receipt.json \
  --covenant covenant.json \
  --approved-covenant-digest OWNER_APPROVED_SHA256 \
  --rpc-url HTTPS_RPC_URL
```

Receipt verification requires the intact covenant, its separately retained approved digest, and a fresh chain read. A self-consistent receipt with a freshly recomputed hash is never authenticated offline; changing its transaction hash and recomputing the checksum still fails the live read. For `provider_request` mode, also supply the current provider result with `--provider`. The receipt proves a funding match, not contract acceptance, human sender identity, legal enforceability, work authorization, delivery, or permission to move funds. The returned `actionAuthority` stays false for work, messaging, and transfers even after `FUNDED`.
