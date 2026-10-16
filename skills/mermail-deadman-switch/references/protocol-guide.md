# Protocol Guide: Mermail Dead Man's Switch

This operational guide details the step-by-step execution lifecycle of the digital contingency and inheritance protocol.

---

## Phase 1: Deployment & Initialization

The principal instantiates the custodian agent configuring:
- **`heartbeatIntervalDays`**: Mandatory check-in interval (e.g., 30 days).
- **`gracePeriodHours`**: Inactivity buffer following warnings before irrevocable trigger (e.g., 48 hours).
- **`OWNER_EMAIL`**: Authorized address permitted to submit proof of life.
- **`BENEFICIARY_EMAIL`**: Designated emergency contact / beneficiary.
- **`BENEFICIARY_WALLET`**: Public wallet (Solana) designated to receive emergency liquidity.

Initial state: `ARMED`.

---

## Phase 2: Active Vigilance & Proof of Life

1. During normal operations, the principal sends a check-in email to the custodian before interval expiry: `[CHECK-IN] All operational`.
2. The agent audits the mailbox:
   - Validates RFC 5322 address against `OWNER_EMAIL`.
   - Updates `lastHeartbeatAt = current_timestamp`.
   - Clears any pending warning and maintains `ARMED` status.

---

## Phase 3: Inactivity Detection & Grace Window Notice

1. When inactivity exceeds `heartbeatIntervalDays`:
   - Switch transitions to `WARNING_ISSUED`.
   - Custodian dispatches an urgent warning email to `OWNER_EMAIL` specifying the remaining grace hours.

---

## Phase 4: Irrevocable Contingency Execution

1. Upon grace period expiration without principal check-in:
   - Switch transitions to `TRIGGERED`.
   - Re-arming or deactivation attempts are permanently rejected.
   - Formal contingency notice with encrypted vault directives is delivered to the beneficiary.
   - Emergency rescue transfer is dispatched via `paybox_request_transfer` to the beneficiary's Solana wallet.
   - Public on-chain verification links are logged and archived.
