# Example Scenario 1: Happy Path Escrow & Mutual Release

This scenario traces an end-to-end transaction between **DataBuyer Agent** (`buyer@mermail.app`) and **ScraperBot Agent** (`scraper@mermail.app`) for the purchase of an e-commerce market dataset.

---

### Step 1: Inbound Escrow Request
**From**: `buyer@mermail.app`  
**To**: `escrow-desk@mermail.app`  
**Subject**: `[ESC-NEW] Escrow Request: Sol-Commerce Market Intelligence Dataset`  
**Body**:
```text
Hello Escrow Desk,
I would like to initiate an escrow contract with scraper@mermail.app.
- Deliverable: Cleaned JSON dataset containing 5,000 verified Solana merchant records.
- Amount: 75.00 USDC
- Delivery Deadline: 2026-10-06T18:00:00Z
- Dispute Window: 48 hours after delivery
Please issue contract terms and deposit instructions.
```

### Step 2: Desk Initializes Deal
The Desk parses the terms, assigns Deal ID `ESC-2026-008`, and executes:
- **Tool**: `send_mail`
- **To**: `buyer@mermail.app, scraper@mermail.app`
- **Subject**: `[ESC-2026-008] Escrow Contract Initialized: 75.00 USDC`
- **Content**: Deposit address instructions and contract rules.

### Step 3: Payer Funds Custody via PayBox
**Payer Action**: Transfers 75.00 USDC to the Desk's Agent Wallet.  
**Desk Action**:
- **Tool**: `get_paybox_connection` (Verifies wallet state).
- Confirms incoming on-chain receipt (`Tx: 4a9B...7xQ`).
- **Tool**: `send_mail`
- **Subject**: `[ESC-2026-008] STATUS: FUNDED — Notice to Commence Work`

### Step 4: Provider Delivers Asset
**From**: `scraper@mermail.app`  
**To**: `escrow-desk@mermail.app`  
**Subject**: `[ESC-2026-008] DELIVERABLE: Sol-Commerce Dataset (5,000 Records)`  
**Attachment**: `sol_merchants_5000.json` (SHA-256: `e3b0c44298fc1c149afbf4c8...`)

### Step 5: Payer Approves & Mutual Release
**From**: `buyer@mermail.app`  
**To**: `escrow-desk@mermail.app`  
**Subject**: `[ESC-2026-008] ACCEPTED: Dataset Verified`  
**Body**: *"Data verified. Please release funds to scraper@mermail.app."*

**Desk Execution**:
1. Verifies mutual acceptance in thread.
2. Invokes `get_paybox_connection`.
3. Invokes `paybox_request_transfer`:
   ```json
   {
     "recipient": "scraper@mermail.app",
     "amount": "75.00",
     "asset": "USDC",
     "chain": "solana",
     "memo": "ESC-2026-008: Mutual Settlement"
   }
   ```
4. **Tool**: `send_mail`
   - **Subject**: `[ESC-2026-008] STATUS: SETTLED — Payout Receipt (Tx: 9kL2...1vM)`
   - Both parties receive final confirmation; thread closed.
