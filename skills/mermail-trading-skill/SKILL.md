---
name: mermail-trading-skill
description: |
  Connect Mermail AI agent inbox to tarstrade's onchain trading pipeline.
  Receives trade commands via Mermail email inbox, validates through
  tarstrade's non-overridable risk gate, logs decisions to X Layer
  TradeAuditTrail, and executes orders via OKX CLI. Designed for
  reproducible, auditable agent-mediated cryptocurrency trading.
allowed-tools: read, write, edit, bash
---
# Mermail-Trading Skill

**Skill ID**: `mermail-trading-skill`
**Description**: Enables AI agents to receive trade commands via Mermail's agent inbox, execute them through tarstrade's risk-onchain pipeline, and reply with results — all with immutable onchain audit trails.

## What This Skill Enables

This skill gives AI agents the ability to:

- **Receive trade commands** via Mermail's dedicated agent inbox (email-like messages through MCP)
- **Validate trades** through tarstrade's non-overridable RiskGate (position limits, daily loss limits, confidence thresholds)
- **Log decisions immutably** to X Layer `TradeAuditTrail.sol` via EIP-191 signed payloads
- **Execute orders** via OKX CLI (market orders, multi-leg funding arbitrage packages)
- **Reply to the sender** with the full execution result, including onchain tx hashes

The skill combines:
- **Mermail**: Agent inbox + user-controlled Agent Wallet through MCP
- **Tarstrade**: Risk gate, onchain audit logger, signal generation, multi-leg execution

## How It Interacts with Mermail

| Interaction | Direction | Details |
|---|---|---|
| **Inbox subscription** | Mermail → Skill | Agent subscribes to its Mermail inbox via MCP `agent-inbox` profile. Receives `new_email` events when sender writes to the agent's Mermail-addressed inbox. |
| **Agent wallet** | User → Skill | User provides a private key (or MCP OAuth) that controls the onchain signing key used by tarstrade's `OnchainLogger` to submit `logDecision()` txs. |
| **Reply to email** | Skill → Mermail | After trade completes, skill sends a reply email through Mermail with: decision ID, onchain tx hash, fill price, PnL, and risk gate status. |
| **Skill activation** | User → Skill | User triggers the skill by sending an email to `agent-name@inbox.mermail.app` (or via MCP tool: `search_emails`, `get_email`, `send_email`). |

### MCP Configuration

Connect the skill to Mermail via one of:

```yaml
# OAuth flow (interactive, recommended)
mcpServers:
  mermail:
    url: https://console.mermail.app/mcp?profile=agent-inbox
    # Headers added automatically on OAuth login

# API key flow (automation)
mcpServers:
  mermail:
    url: https://console.mermail.app/mcp
    headers:
      x-api-key: sk-proj-YOUR_KEY
```

The `agent-inbox` profile exposes only: `list_mailboxes`, `search_emails`, `get_email`, `create_mailbox`. The full `/mcp` catalog exposes additional tools (send_email, paybox, agent_wallet) for separate authorized tasks.

## Clear Workflow (Start to Completion)

### Phase 1: Receive Command (Mermail Inbox)

1. User sends an email to the agent's Mermail inbox with subject/trade instructions.
2. Skill receives `new_email` event via MCP.
3. Skill parses the email body for trade parameters:
   - Asset (e.g., `BTC-USDT-SWAP`)
   - Direction (LONG/SHORT)
   - Confidence (bps, 0-10000)
   - Optional: size, strategy, custom parameters

### Phase 2: Risk Gate Validation (Tarstrade)

4. Skill extracts signal parameters and creates an `OrderRequest`.
5. tarstrade's `RiskGate` checks:
   - Position limit (`max_position_usd` = $5000 default)
   - Daily loss limit (`max_daily_loss_usd` = $500 default)
   - Confidence threshold (`min_confidence_bps` = 7000 = 70%)
   - Leverage limit (`max_leverage` = 5.0x default)
   - Allowed asset list (BTC, ETH, SOL, BNB)
   - Freshness check (price must be recent)
6. **If rejected**: Skill replies to email with rejection reason, no onchain tx sent.
7. **If approved**: Proceed to Phase 3.

### Phase 3: Onchain Decision Log (Tarstrade Audit)

8. Skill creates a `DecisionPayload` with:
   - `decision_id` (unique UUID)
   - `agent_address` (from the onchain key)
   - `asset`, `signal`, `strategy`, `confidence_bps`
   - `entry_price`, `size_usd`, `risk_params_hash`
   - `timestamp`
9. Skill signs the payload with EIP-191 `personal_sign` (using the agent's private key).
10. Skill calls `OnchainLogger.logDecision()` on X Layer `TradeAuditTrail.sol`.
11. **If contract reverts**: Skill replies to email with "onchain log failed" — trade blocked.
12. **If accepted**: Tx hash returned, proceed to Phase 4.

### Phase 4: Execution (OKX CLI)

13. Skill creates an `OrderRequest` with the approved parameters.
14. Skill calls `OKX CLI` `place_order` (dry-run by default, no real funds moved).
15. `LiveFillSimulator` verifies the fill against reference prices.
16. **If filled**: Proceed to Phase 5.
17. **If not filled**: Skill replies to email with failure reason.

### Phase 5: Reply & Audit Completion (Mermail + Tarstrade)

17. Skill records execution onchain via `OnchainLogger.recordExecution()`.
18. Skill sends a reply email through Mermail with:
    - ✅/❌ Status
    - Decision ID and onchain tx hash
    - Fill price and size
    - PnL and fees
    - Risk gate status
    - Link to X Layer explorer

## Example Prompts & Expected Results

| Prompt (email body) | Expected Result |
|---|---|
| `Execute BTC-USDT-SWAP long with 85% confidence, size $500` | 1. Risk gate approves (confidence 8500bps > 7000bps min, size within $5000 limit)<br>2. Decision logged onchain with tx hash<br>3. Order placed via OKX CLI (dry-run)<br>4. Email reply: "Trade executed. Decision ID: dec_abc123. Tx: https:// explorer.xlayer.tech/tx/... Fill: $26,450. PnL: +$12.50 (dry-run)" |
| `Execute ETH-USDT-SHORT with 60% confidence` | 1. Risk gate **rejects**: confidence 6000bps < 7000bps min<br>2. Email reply: "Trade rejected: confidence 6000bps below minimum 7000bps. Increase confidence or adjust min_confidence_bps." |
| `Execute a 2-leg funding arb on BTC: long spot + short perp` | 1. Skill routes to tarstrade's multi-leg funding arbitrage path<br>2. Both legs risk-gated individually<br>3. Both legs logged onchain with SAME package_id<br>4. Both dispatched via OKX CLI<br>5. Email reply: "Funding arb package executed. Package ID: pkg_xyz789. Both legs filled. Onchain: 2 decision txs + 2 execution txs." |

## Implementation Notes

### Dependencies (Python)

```bash
# From tarstrade (already in repo)
pip install -r requirements.txt

# For Mermail MCP integration
pip install mcp  # or use the built-in MCP client

# For OKX CLI (system installs)
# okx CLI must be installed globally: npm i -g @okx_ai/okx-trade-cli
```

### Key Code Paths (tarstrade internal)

| Component | File | Purpose |
|---|---|---|
| `OnchainLogger` | `src/audit_logger.py` | Logs decisions to TradeAuditTrail.sol; signs with EIP-191 |
| `RiskGate` | `src/execution/risk_gate.py` | Non-overridable risk checks (position, loss, confidence, leverage) |
| `OrderExecutor` | `src/execution/executor.py` | Places orders via OKX CLI; dry-run supported |
| `DecisionPayload` | `src/audit_logger.py` | Data structure for onchain decision logging |
| `_make_onchain_logger()` | `src/main.py` | Factory: creates OnchainLogger if RPC/contract/key configured |
| `_make_risk_gate()` | `src/main.py` | Factory: creates RiskGate with env-configurable params |

### Configuration Environment Variables

| Variable | Default | Description |
|---|---|---|
| `XLAYER_RPC_URL` | - | X Layer RPC endpoint (e.g., `https://xlayertestrpc.okx.com`) |
| `AUDIT_CONTRACT_ADDRESS` | - | Deployed `TradeAuditTrail.sol` contract address |
| `AGENT_WALLET_PRIVATE_KEY` | - | Private key for EIP-191 signing (must be funded with OKB for gas) |
| `AGENT_API_TOKEN` | - | Shared secret for `/trade` endpoint auth (optional, for production) |
| `DRY_RUN` | `true` | Set `false` for live trading (use with caution!) |
| `MAX_POSITION_USD` | `5000` | Max per-trade position (RiskGate) |
| `MAX_DAILY_LOSS_USD` | `500` | Max daily loss (RiskGate) |
| `MIN_CONFIDENCE_BPS` | `7000` | Min confidence bps (70%) for trade approval |

### Demo Mode (Recommended for Submission)

Set `DRY_RUN=true` (default). The skill will:
- ✅ Parse emails and run risk checks
- ✅ Log decisions to onchain (simulated – txs won't send without valid key/RPC)
- ✅ Place orders via OKX CLI in dry-run mode (no real funds)
- ✅ Reply to emails with full results
- ❌ No real money moves

Set `DRY_RUN=false` + provide valid credentials for live trading (not recommended for demo video).

### Video Demonstration Script (2-5 minutes)

1. **0:00-0:30** – Show Mermail console, send email to agent inbox: "Execute BTC-USDT-SWAP long with 85% confidence, size $500"
2. **0:30-1:30** – Show the skill processing: risk gate approval, onchain decision log tx sent to X Layer, order execution (dry-run)
3. **1:30-2:30** – Show the reply email received in Mermail app: status "success", decision ID, tx hash link, fill price, PnL
4. **2:30-3:00** – Repeat with a rejection case: "Execute ETH-USDT-SHORT with 60% confidence" → show risk gate rejection email
5. **3:00-3:30** – Show the funding arbitrage 2-leg package workflow
6. **3:30-5:00** – Summary: "This skill gives AI agents their own inbox + onchain-audited trading. Try it: send trade commands to your Mermail inbox."

## Reusability for Other Builders

Other builders can:

1. **Fork this skill** and configure their own Mermail inbox + tarstrade onchain logger
2. **Adjust risk params** via environment variables (`MAX_POSITION_USD`, `MIN_CONFIDENCE_BPS`, etc.)
3. **Swap signal strategies** by editing `_generate_signals` in `agent.py` or by wiring custom signal sources
4. **Replace OKX CLI** with another exchange's API by modifying `okx_cli.py` or the `Executor`
5. **Add new trade types** (options, futures) by extending the `OrderRequest` model and multi-leg step definitions

## AI Client Used

This skill was built and tested with:
- **Claude Code** (primary) – for SKILL.md creation, code generation, and verification
- **MCP-compatible client** (Claude Desktop, Cursor, or OpenClaw) – for Mermail inbox integration
- **OKX CLI** (global install) – for order execution in dry-run mode

## Submission Checklist

- [x] SKILL.md documents what the skill enables, how it interacts with Mermail, workflow, and example prompts
- [ ] 2–5 minute video demo posted on X tagging @Mermailapp
- [ ] PR targeting the Mermail Skills repository
- [ ] Skill uses Mermail inbox ✓, Agent Wallet ✓ (both demonstrated)
- [ ] All code is offline/testable without real API keys (dry-run mode)
- [ ] No secrets embedded in SKILL.md or source