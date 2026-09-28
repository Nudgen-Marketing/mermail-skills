# Vendor Policy & Address Pinning Specification

The vendor policy acts as the immutable ground truth for accounts payable automation. The policy defines pre-authorized vendor organizations, their verified sender domains, pinned payment addresses, and financial limits.

## Policy Schema

```json
{
  "version": "1.0",
  "policy_name": "Standard Corporate Accounts Payable",
  "default_currency": "USDC",
  "global_rules": {
    "max_unattended_single_invoice_usd": 500.0,
    "require_two_party_approval_above_usd": 1000.0,
    "allow_address_override_from_email": false
  },
  "approved_vendors": [
    {
      "vendor_id": "datadog-cloud",
      "vendor_name": "Datadog Cloud Monitoring",
      "allowed_sender_domains": ["datadoghq.com", "billing.datadoghq.com"],
      "pinned_payment_rail": "evm",
      "pinned_address": "0x534c561765c92c813587b140685744f475a894a7",
      "pinned_network": "base",
      "max_single_invoice_usd": 500.0,
      "monthly_budget_usd": 1500.0
    },
    {
      "vendor_id": "helius-solana",
      "vendor_name": "Helius Solana Infrastructure",
      "allowed_sender_domains": ["helius.dev", "invoicing.helius.dev"],
      "pinned_payment_rail": "solana",
      "pinned_address": "Hel1usRPC1111111111111111111111111111111111",
      "pinned_network": "solana",
      "max_single_invoice_usd": 300.0,
      "monthly_budget_usd": 1000.0
    },
    {
      "vendor_id": "quicknode-web3",
      "vendor_name": "QuickNode Web3 Nodes",
      "allowed_sender_domains": ["quicknode.com"],
      "pinned_payment_rail": "evm",
      "pinned_address": "0x2286ba6d7cb0efb18c61e680e61ec2a74c42c949",
      "pinned_network": "base",
      "max_single_invoice_usd": 400.0,
      "monthly_budget_usd": 1200.0
    }
  ]
}
```

## Policy Verification Algorithms

1. **Domain Matching**:
   - Extract the RFC 5322 `From` header and check if its domain exists in `allowed_sender_domains`.
   - Reject lookalike/typosquat domains (e.g. `datad0ghq.com`).

2. **Cryptographic Address Pinning**:
   - Compute checksummed address (EVM: EIP-55) or Base58 decode (Solana).
   - Exact string comparison against `pinned_address`.
   - Any difference triggers immediate `QUARANTINE_ADDRESS_MISMATCH`.

3. **Budget Compliance**:
   - `invoice.total_amount <= vendor.max_single_invoice_usd`.
   - `vendor.current_month_total + invoice.total_amount <= vendor.monthly_budget_usd`.
