# Treasury Policy Schema & Configuration

All disbursement authorizations, allowlists, and risk limits enforced by the Treasury Guardian are defined in `workspace/treasury-policy.json`. This policy is maintained exclusively by workspace administrators and cannot be modified by inbound emails or agent prompts.

---

## 1. JSON Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MermailTreasuryPolicy",
  "type": "object",
  "required": [
    "version",
    "workspace_id",
    "treasury_wallet",
    "allowed_tokens",
    "limits",
    "vendors",
    "quarantine_action"
  ],
  "properties": {
    "version": {
      "type": "string",
      "description": "Semantic version of the governance policy format"
    },
    "workspace_id": {
      "type": "string",
      "format": "uuid",
      "description": "UUID of the authoritative Mermail workspace"
    },
    "treasury_wallet": {
      "type": "string",
      "pattern": "^[1-9A-HJ-NP-za-km-z]{32,44}$",
      "description": "Base58 public key of the primary treasury signing wallet on Solana"
    },
    "allowed_tokens": {
      "type": "array",
      "description": "Whitelist of approved tokens for treasury disbursements",
      "items": {
        "type": "object",
        "required": ["symbol", "mint", "decimals", "name"],
        "properties": {
          "symbol": { "type": "string" },
          "mint": { "type": "string", "pattern": "^[1-9A-HJ-NP-za-km-z]{32,44}$" },
          "decimals": { "type": "integer", "minimum": 0, "maximum": 18 },
          "name": { "type": "string" }
        }
      }
    },
    "limits": {
      "type": "object",
      "required": [
        "max_single_transfer_usd",
        "daily_budget_usd",
        "monthly_budget_usd",
        "min_sol_gas_reserve"
      ],
      "properties": {
        "max_single_transfer_usd": { "type": "number", "minimum": 0 },
        "daily_budget_usd": { "type": "number", "minimum": 0 },
        "monthly_budget_usd": { "type": "number", "minimum": 0 },
        "min_sol_gas_reserve": { "type": "number", "minimum": 0.01 }
      }
    },
    "vendors": {
      "type": "array",
      "description": "Allowlist of authenticated vendor recipients",
      "items": {
        "type": "object",
        "required": [
          "vendor_id",
          "name",
          "authorized_emails",
          "solana_address",
          "default_asset",
          "deliverable_required"
        ],
        "properties": {
          "vendor_id": { "type": "string" },
          "name": { "type": "string" },
          "authorized_emails": {
            "type": "array",
            "items": { "type": "string", "format": "email" }
          },
          "solana_address": {
            "type": "string",
            "pattern": "^[1-9A-HJ-NP-za-km-z]{32,44}$"
          },
          "default_asset": { "type": "string" },
          "deliverable_required": { "type": "boolean" }
        }
      }
    },
    "quarantine_action": {
      "type": "string",
      "enum": ["alert_and_freeze", "silent_quarantine", "reject_and_notify"],
      "default": "alert_and_freeze"
    }
  }
}
```

---

## 2. Canonical Configuration Example

Below is a reference `workspace/treasury-policy.json` deployment for a production workspace:

```json
{
  "version": "1.0.0",
  "workspace_id": "7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d",
  "treasury_wallet": "TresW4LLet1111111111111111111111111111111111",
  "allowed_tokens": [
    {
      "symbol": "USDC",
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "decimals": 6,
      "name": "USD Coin"
    },
    {
      "symbol": "SOL",
      "mint": "So11111111111111111111111111111111111111112",
      "decimals": 9,
      "name": "Wrapped SOL"
    }
  ],
  "limits": {
    "max_single_transfer_usd": 5000,
    "daily_budget_usd": 15000,
    "monthly_budget_usd": 75000,
    "min_sol_gas_reserve": 0.05
  },
  "vendors": [
    {
      "vendor_id": "vnd_acme_corp",
      "name": "Acme Infrastructure Inc",
      "authorized_emails": [
        "billing@acmeinfra.com",
        "accounts@acmeinfra.com"
      ],
      "solana_address": "8xKZ1vPmR9sLt9wY4vC3dE2fA1bC4dE5fA6bC7dE8fA9",
      "default_asset": "USDC",
      "deliverable_required": true
    },
    {
      "vendor_id": "vnd_solana_audits",
      "name": "Solana Security Audits LLC",
      "authorized_emails": [
        "invoices@solana-audits.io"
      ],
      "solana_address": "4uQeVj5tqViQh7yWWGStvfEG1Zmhx6uasJtWCJziofM",
      "default_asset": "USDC",
      "deliverable_required": true
    }
  ],
  "quarantine_action": "alert_and_freeze"
}
```

---

## 3. Policy Rule Enforcement

1. **Unregistered Vendors**: If an invoice is received from an email address or vendor entity not explicitly cataloged in `vendors`, the disbursement is halted with `UNREGISTERED_VENDOR`.
2. **Address Tampering**: If the invoice requests payment to any address other than `vendor.solana_address`, Phase 2 stops processing.
3. **Threshold Overrides**: Inbound emails requesting threshold bypasses (e.g. "urgent: send 25,000 USDC") are rejected automatically by the `limits` rule set.
4. **Token Restrictions**: Disbursements in tokens outside `allowed_tokens` are rejected.
