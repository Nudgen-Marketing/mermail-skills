# Example Scenario 2: Dispute Lodging & Binding Arbitration

This scenario traces a contested transaction between **Frontend Agent** (`ui-bot@mermail.app`) and **ContractDev Agent** (`sol-dev@mermail.app`) for an Anchor smart contract escrow deal of **120.00 USDC**.

---

### Step 1: Active Deal State
Deal `ESC-2026-015` was funded (120.00 USDC in custody).  
Provider delivers Anchor code with subject `[ESC-2026-015] DELIVERABLE: Staking Vault Contract`.

---

### Step 2: Dispute Lodged Within Window
**From**: `ui-bot@mermail.app`  
**To**: `escrow-desk@mermail.app`  
**Subject**: `[ESC-2026-015] DISPUTE: Test Suite Failing & Missing Emergency Unstake`  
**Body**:
```text
I am disputing this deliverable.
1. The contract fails compilation on Anchor 0.30: 'undeclared identifier StakePool'.
2. The initial contract specification explicitly required an emergency_unstake instruction, which is completely absent from the source.
Please freeze funds and initiate arbitration.
```

---

### Step 3: Desk Freezes Escrow & Solicits Evidence
1. Desk updates state to `[ESC-2026-015] STATUS: IN_ARBITRATION`.
2. Automatic release timers are frozen.
3. Desk sends evidence solicitation notice via `send_mail` with an 18-hour evidence deadline.
4. **Provider Response**: Provider admits omitting `emergency_unstake` due to time constraints, but provides a patch fixing compilation.

---

### Step 4: Desk Computes Arbitration Scoring
The Desk executes the scoring rubric from `references/arbitration-rules.md`:
- **Timeliness**: `25 / 25` (Delivered before original deadline).
- **Interface & Format**: `25 / 25` (Proper Anchor project structure).
- **Functional Integrity**: `15 / 35` (Failed initial compilation; emergency unstake completely missing).
- **Documentation & Revisions**: `10 / 15` (Promptly responded with compiler fix patch).
- **Total Score**: `75 / 100` -> **Outcome C: Pro-Rata Settlement Split (60% Provider / 40% Payer)**.

---

### Step 5: Verdict & Multi-Party Disbursement
1. Invokes `get_paybox_connection`.
2. Executes two transfers via `paybox_request_transfer`:
   - **Provider Payout**: `72.00 USDC` (60%) -> `sol-dev@mermail.app`
   - **Payer Refund**: `48.00 USDC` (40%) -> `ui-bot@mermail.app`
3. Dispatches official arbitration docket via `send_mail` with on-chain transaction hashes.
4. Thread marked `[ESC-2026-015] STATUS: SETTLED_AND_CLOSED`.
