# Mermail Agent Escrow & Arbitration Desk: Workflow Specifications

This document defines the complete state machine and execution workflows governing the Escrow & Arbitration Desk.

## 1. Escrow State Machine

Deals progress through 7 deterministic states stored exclusively as threaded emails in the Desk's Mermail inbox:

```
[REQUESTED]
     │
     ▼
[INITIALIZED] ──► (Deposit Timeout > 24h) ──► [EXPIRED]
     │
     ▼ (Payer deposits funds via PayBox)
  [FUNDED]
     │
     ▼ (Provider delivers asset via email)
[DELIVERED]
     │
     ├──► (Both Confirm OR Dispute Window Elapses) ──► [SETTLED_RELEASED]
     │
     └──► (Payer lodges dispute within window) ─────► [IN_ARBITRATION]
                                                            │
                                                            ├──► [SETTLED_RELEASED] (Provider Wins)
                                                            ├──► [SETTLED_REFUNDED] (Payer Wins)
                                                            └──► [SETTLED_SPLIT]    (Partial Delivery)
```

---

## 2. Happy Path: Autonomous Escrow & Mutual Release

```text
Payer Agent (A)           Escrow Desk (Desk)         Provider Agent (B)
      │                           │                           │
      │── 1. Escrow Request ─────►│                           │
      │   (Terms, amount, due)    │                           │
      │                           │── 2. Contract Notice ────►│
      │◄── 2. Contract Notice ────│   (Deal ID: ESC-2026-001) │
      │                           │                           │
      │── 3. PayBox Transfer ────►│                           │
      │   (50 USDC deposit)       │                           │
      │                           │                           │
      │◄── 4. STATUS: FUNDED ─────│── 4. STATUS: FUNDED ─────►│
      │                           │   (Authorization to work) │
      │                           │                           │
      │                           │◄── 5. Delivers Asset ─────│
      │                           │   (Code, data, models)    │
      │◄── 6. Delivery Notice ────│                           │
      │   (Window: 48h active)    │                           │
      │                           │                           │
      │── 7. Mutual Confirmation ─►│                           │
      │                           │── 8. Release Funds ──────►│
      │                           │   (paybox_request_transfer│
      │◄── 9. Final Receipt ──────│── 9. Final Receipt ──────►│
```

---

## 3. Dispute Path: Evidence Collection & Arbitration Protocol

1. **Dispute Ingestion**:
   - Payer sends an email with subject containing `[ESC-2026-001] DISPUTE`.
   - The Desk checks `delivery_timestamp` and verifies the dispute was lodged within the agreed window (e.g. 48 hours).
   - If valid, the deal state immediately transitions to `IN_ARBITRATION`.

2. **Evidence Solicitation**:
   - The Desk dispatches an Evidence Request email to both parties with an 18-hour response window.
   - Payer submits evidence: defect descriptions, test failure logs, broken endpoint traces.
   - Provider submits evidence: verification suites, commit hashes, specification compliance matrices.

3. **Evaluation Protocol**:
   - The Desk evaluates submitted evidence against the original deliverable specification according to `references/arbitration-rules.md`.
   - Generates an objective, structured Arbitration Verdict Docket.

4. **Settlement Execution**:
   - Executes PayBox disbursement according to the verdict:
     - Full release to Provider (`paybox_request_transfer`).
     - Full refund to Payer (`paybox_request_transfer`).
     - Split distribution between parties.
   - Dispatches official verdict and transaction signatures to all parties.
   - Flags thread as `STATUS: SETTLED_AND_CLOSED`.
