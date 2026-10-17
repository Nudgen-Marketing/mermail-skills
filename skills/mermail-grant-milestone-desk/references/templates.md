# Grant Milestone Desk Templates

This reference provides standardized templates for grant policies, deliverable evaluation cards, payout previews, and audit receipts.

---

## 1. Standing Grant Policy Template

Stored in workspace storage or provided by the sponsor during desk initialization.

```json
{
  "grant_id": "grant-sol-mobile-042",
  "title": "Superteam Mobile SDK for Solana",
  "grantee_organization": "Solana Mobile Builders Lab",
  "grantee_payout_address": "8vFtM21B6jXW7N8aU9Kz3QyF1eRpT6dY5sC4aB3xKp7L",
  "currency": "USDC",
  "chain": "solana",
  "total_allocation": 5000,
  "disbursed_total": 1000,
  "remaining_cap": 4000,
  "milestones": [
    {
      "index": 1,
      "title": "Architecture Specification & Core Wallet Adapter",
      "allocation": 1000,
      "status": "COMPLETED",
      "tx_hash": "5Kq...zNp"
    },
    {
      "index": 2,
      "title": "Biometric Signer Integration & Test Suite",
      "allocation": 2000,
      "status": "PENDING_SUBMISSION",
      "required_deliverables": [
        "GitHub PR merged to main with CI passing",
        "Biometric authentication unit & integration tests > 80% coverage",
        "Developer documentation published at docs.example.com"
      ]
    },
    {
      "index": 3,
      "title": "Production Release & Mainnet Demo App",
      "allocation": 2000,
      "status": "PENDING_SUBMISSION",
      "required_deliverables": [
        "Play Store / APK release link",
        "Public mainnet transaction verification"
      ]
    }
  ]
}
```

---

## 2. Deliverable Evaluation Scorecard

Rendered in chat when evaluating a grantee submission email.

```markdown
### 📋 Milestone Deliverable Evaluation Scorecard

**Grant:** Superteam Mobile SDK for Solana (`grant-sol-mobile-042`)  
**Milestone:** Milestone 2 — Biometric Signer Integration & Test Suite  
**Grantee:** Solana Mobile Builders Lab  
**Claimed Allocation:** 2,000 USDC  

| Requirement | Submitted Artifact | Status | Audit Notes |
| --- | --- | --- | --- |
| GitHub PR merged with CI pass | [PR #24](https://github.com/example/sol-sdk/pull/24) | ✅ PASS | Merged commit `a3b8c1d`; GitHub Actions CI 100% green |
| Test Coverage > 80% | `coverage/lcov-report` | ✅ PASS | 84.6% branch coverage verified in report artifact |
| Developer Documentation | `https://docs.example.com/biometrics` | ✅ PASS | Live docs verified; includes code examples |
| Recipient Address Check | `8vFtM21B6j...3xKp7L` | ✅ PASS | Matches standing grant policy address exactly |

**Evaluation Result:** `VERIFIED — APPROVED FOR PAYOUT PROPOSAL`
```

---

## 3. Payout Proposal Preview Card

Presented to the sponsor before calling `paybox_request_transfer`.

```markdown
### 💳 PayBox Milestone Payout Proposal Preview

> [!IMPORTANT]
> The following transaction proposal will be submitted to Mermail PayBox upon your confirmation. Cryptographic signing is required via the PayBox Console.

- **Grant Title:** Superteam Mobile SDK for Solana
- **Milestone Index:** Milestone 2
- **Network / Token:** Solana (USDC)
- **Authorized Recipient:** `8vFtM21B6jXW7N8aU9Kz3QyF1eRpT6dY5sC4aB3xKp7L`
- **Payout Amount:** **2,000.00 USDC**
- **Current Treasury Balance:** 14,250.00 USDC
- **Grant Budget Cap Before:** 4,000.00 USDC
- **Projected Grant Cap After:** 2,000.00 USDC
- **Memo:** `Grant Payout: grant-sol-mobile-042 - Milestone 2`

*Reply "Approve" or "Proceed" to generate the PayBox signing handoff URL.*
```

---

## 4. Milestone Completion Receipt Email

Drafted with `save_draft` and sent to the grantee thread with `send_email`.

```markdown
**Subject:** Milestone 2 Completed & Payout Confirmed — Superteam Mobile SDK

**From:** grants@mermail.app  
**To:** dev-lead@solanamobilebuilders.org  
**Cc:** finance@superteam.fun  

---

Dear Solana Mobile Builders Lab Team,

We are pleased to inform you that your deliverables for **Milestone 2 (Biometric Signer Integration & Test Suite)** under the **Superteam Mobile SDK Grant** have been verified and approved.

### Payout Details
- **Milestone:** Milestone 2
- **Disbursed Amount:** 2,000.00 USDC
- **Recipient Address:** `8vFtM21B6jXW7N8aU9Kz3QyF1eRpT6dY5sC4aB3xKp7L`
- **Solana Transaction Hash:** `4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2`
- **Block Explorer:** [View on Solscan](https://solscan.io/tx/4zY1u7xK9pLm2Nv5Qw8Rs1Tc3Ya7Bf9Ge2Hj6Kl4Np8Qr1St3Uv5Wx7Yz9Aa1Bb2)

### Grant Financial Status
- **Total Grant Allocation:** 5,000.00 USDC
- **Total Disbursed to Date:** 3,000.00 USDC
- **Remaining Cap:** 2,000.00 USDC (reserved for Milestone 3: Production Release)

Thank you for your outstanding contribution to the Solana ecosystem.

Warm regards,  
**Superteam Grant Operations Desk**  
*Powered by Mermail Agent Skills & PayBox*
```
