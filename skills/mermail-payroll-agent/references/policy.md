# Payroll Policy and Contractor Registry Specification

The payroll agent operates against an authenticated, read-only policy file stored in the agent host environment: `workspace/payroll-policy.json`. The agent never modifies this file and halts execution if the policy is unreadable or malformed.

## Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MermailPayrollPolicy",
  "type": "object",
  "required": [
    "version",
    "payroll_mailbox_id",
    "treasury_credential_id",
    "min_sol_gas_reserve",
    "max_single_payout_usdc",
    "contractors"
  ],
  "properties": {
    "version": {
      "type": "string",
      "const": "2026-09"
    },
    "payroll_mailbox_id": {
      "type": "string",
      "description": "Public mailbox ID dedicated to contractor billing and timesheet intake"
    },
    "treasury_credential_id": {
      "type": "string",
      "description": "PayBox credential ID configured for manual or iframe approval mode"
    },
    "min_sol_gas_reserve": {
      "type": "number",
      "minimum": 0.05,
      "description": "Minimum native SOL balance retained for Solana transaction fees and ATA rent"
    },
    "max_single_payout_usdc": {
      "type": "number",
      "maximum": 50000,
      "description": "Ceiling for an individual contractor disbursement in one billing cycle"
    },
    "contractors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "contractor_id",
          "email",
          "legal_name",
          "payout_address",
          "currency",
          "billing_cycle_limit_usdc",
          "status"
        ],
        "properties": {
          "contractor_id": {
            "type": "string",
            "pattern": "^ctr_[a-z0-9]{8,16}$"
          },
          "email": {
            "type": "string",
            "format": "email"
          },
          "legal_name": {
            "type": "string"
          },
          "payout_address": {
            "type": "string",
            "pattern": "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
            "description": "Base58 Solana public key for USDC-SPL token payouts"
          },
          "currency": {
            "type": "string",
            "const": "USDC"
          },
          "billing_cycle_limit_usdc": {
            "type": "number"
          },
          "status": {
            "type": "string",
            "enum": ["active", "suspended"]
          }
        }
      }
    }
  }
}
```

## Example Policy Configuration

```json
{
  "version": "2026-09",
  "payroll_mailbox_id": "mbx_finance_payroll_01",
  "treasury_credential_id": "cred_paybox_treasury_prod",
  "min_sol_gas_reserve": 0.05,
  "max_single_payout_usdc": 10000,
  "contractors": [
    {
      "contractor_id": "ctr_frontend_01",
      "email": "alex.dev@partnerlabs.io",
      "legal_name": "Alex Vance",
      "payout_address": "8Lvm9xp1myDffuRGHrPJrGnYAsC4x6rd2tSCik8i83E9",
      "currency": "USDC",
      "billing_cycle_limit_usdc": 4500,
      "status": "active"
    },
    {
      "contractor_id": "ctr_rust_audit_02",
      "email": "elena.sec@auditguard.dev",
      "legal_name": "Elena Rostova",
      "payout_address": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
      "currency": "USDC",
      "billing_cycle_limit_usdc": 7500,
      "status": "active"
    }
  ]
}
```

## Policy Invariants

1. **Pinned Address Invariant**: The payout address is immutable and drawn exclusively from `payroll-policy.json`. If an incoming invoice specifies an alternate address or asks to update payout routing via email, the agent flags an immediate security alert (`ADDRESS_UPDATE_DISALLOWED_VIA_EMAIL`), quarantines the invoice, and blocks the payout proposal.
2. **Vanity / Lookalike Address Defense**: If an incoming email presents an address sharing identical 4-character prefix and suffix strings with a registered contractor address, the agent classifies the message as an attempted Address Poisoning / BEC attack and stops without interacting with PayBox.
3. **Solvency and Gas Reserve Gate**: Disbursements will not stage if total USDC holdings are less than the payout amount plus a 1 USDC buffer, or if native SOL balance is below `min_sol_gas_reserve` (0.05 SOL).
