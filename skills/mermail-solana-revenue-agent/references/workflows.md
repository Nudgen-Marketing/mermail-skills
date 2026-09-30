# Mermail Solana Revenue Agent Workflows

Detailed step-by-step execution workflows for inbound invoice triage, Solana token swaps, and cryptographic receipt generation.

---

## Workflow 1: Inbound Solana Invoice Processing & Settlement

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Inbound Client
    participant Inbox as Mermail Inbox
    participant Agent as Revenue Agent
    participant PayBox as Mermail PayBox (Solana)
    actor Owner as Swarm Owner (Signer)

    Customer->>Inbox: Sends invoice email (Amount: 50 USDC, Solana Address)
    Agent->>Inbox: list_emails(filter: is_read=false)
    Inbox-->>Agent: Returns email object (clean scan)
    Agent->>Agent: Extract Base58 address & 50 USDC intent
    Agent->>PayBox: get_paybox_connection()
    PayBox-->>Agent: ACTIVE
    Agent->>PayBox: paybox_get_portfolio()
    PayBox-->>Agent: Holdings: 120 USDC (Solana), 2.4 SOL
    Agent->>Owner: Display single-turn Authorization Preview
    Owner-->>Agent: Confirmed / Prompt Authorization Envelope
    Agent->>PayBox: paybox_request_transfer(chain="solana", asset="USDC", amount="50", destination="...")
    PayBox-->>Agent: status="pending_signature", console_url="https://console.mermail.app/..."
    Agent->>Owner: Present signing URL
    Owner->>PayBox: Signs passkey/transaction in PayBox console
    Agent->>PayBox: paybox_get_request(request_id)
    PayBox-->>Agent: status="success", tx_hash="5Kz...9aQ"
    Agent->>Inbox: reply_to_email(body=HTML Receipt with Solscan link)
    Inbox-->>Customer: Receipt delivered
```

### Execution Steps
1. **Fetch & Sanitize:** Call `list_emails(limit=10, is_read=false)` and select target message. Validate `scan_status == "clean"`.
2. **Entity Extraction:** Parse the requested payment currency, destination Solana wallet address, and line-item details.
3. **Connection Check:** Probe `get_paybox_connection`. If unlinked, generate connection deep link and pause.
4. **Portfolio Read:** Call `paybox_get_portfolio`. Verify sufficient `USDC` balance ($\ge 50$) and `SOL` for rent exemption.
5. **Execution:** Dispatch `paybox_request_transfer`.
6. **Reconciliation:** Poll `paybox_get_request(request_id)` once until terminal state `success`.
7. **Receipt Delivery:** Dispatch formatted HTML email with itemized table and Solscan link (`https://solscan.io/tx/{tx_hash}`).

---

## Workflow 2: Automated Solana DEX Swap & Liquidity Rebalancing

```mermaid
sequenceDiagram
    autonumber
    actor User as Swarm Operator
    participant Agent as Revenue Agent
    participant PayBox as Mermail PayBox
    participant DEX as Solana Liquidity (Jupiter/Orca)

    User->>Agent: "Swap 1.5 SOL to USDC in PayBox and notify treasury"
    Agent->>PayBox: paybox_get_portfolio()
    PayBox-->>Agent: Current SOL: 4.2, USDC: 10.0
    Agent->>Agent: Calculate slippage tolerance (max 0.5%)
    Agent->>PayBox: paybox_request_swap(src_chain="solana", src_token="SOL", dst_token="USDC", amount="1.5")
    PayBox->>DEX: Route optimal swap quote
    PayBox-->>Agent: status="pending_signature", console_url="..."
    Agent->>User: Request signature via console_url
    User->>PayBox: Approves in Mermail Console
    Agent->>PayBox: paybox_get_request(request_id)
    PayBox-->>Agent: status="success", dst_amount_received="295.42 USDC"
    Agent->>User: Display final execution confirmation & new balances
```

### Execution Steps
1. **Validate Swap Limits:** Confirm `amount` does not exceed user's authorized threshold.
2. **Quote & Submit:** Invoke `paybox_request_swap(credential_id, src_chain="solana", src_token="SOL", dst_token="USDC", amount="1.5")`.
3. **Capture Signature:** Direct user to single `signing_handoff.console_url`.
4. **Verify Settlement:** Reconcile via `paybox_get_request`.
5. **Report:** Output structured Markdown summary of traded pair, effective execution price, and updated portfolio.

---

## Workflow 3: Superteam / DoraHacks Bounty Payout Triage & Accounting

```mermaid
sequenceDiagram
    autonumber
    participant Bounty as Superteam Earn / DoraHacks
    participant Inbox as Mermail Inbox
    participant Agent as Revenue Agent
    participant Database as Swarm Telemetry DB

    Bounty->>Inbox: Payout Notification: "Bounty Prize 2,500 USDC Awarded"
    Agent->>Inbox: get_email()
    Agent->>Agent: Parse Prize, Deliverable ID & Tx Hash
    Agent->>Database: Record revenue event in swarm_data.db
    Agent->>Inbox: reply_to_email("Thank you! Payout received and verified on Solana.")
    Agent->>Agent: Dispatch Telegram alert to Swarm Master Brain
```
