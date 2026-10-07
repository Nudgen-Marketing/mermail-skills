# Mermail Crypto Signal Triage Agent
## What the skill enables
The Crypto Signal Triage Agent automates the processing of incoming trading signals (e.g., from TradingView or newsletters). It continuously monitors the agent's inbox for specific alert emails, parses critical trading data (Ticker, Entry Price, Take Profit, Stop Loss), calculates basic risk metrics, and prepares a structured execution summary. This eliminates manual signal parsing and bridges the gap between external email alerts and automated on-chain or API execution.
## How it interacts with Mermail
- **Mermail Inbox:** The agent uses MCP to read incoming emails, filtering by specific senders or subjects (e.g., "Trade Alert" or "TradingView Signal").
- **Mermail Agent Wallet (Optional Integration):** Once the signal is parsed and validated against predefined risk parameters, the agent can use the wallet to simulate or execute a swap/trade on-chain based on the parsed data.
## A clear workflow from start to completion
1. **Trigger:** The user prompts the agent to monitor the inbox for new trading signals.
2. **Retrieve:** A signal email arrives. The agent connects to the Mermail Inbox and reads the contents of the unread message.
3. **Parse & Analyze:** The agent extracts the cryptocurrency ticker, direction (Long/Short), entry price, and stop-loss levels from the email body.
4. **Risk Calculation:** The agent calculates the distance to the stop-loss to ensure it fits within the user's maximum risk tolerance (e.g., strictly < 5% risk).
5. **Output/Action:** The agent generates a structured summary ready for a Telegram API webhook or prepares a draft transaction for the Agent Wallet.
## Example prompts and expected results
**Prompt 1:**
> "Check my Mermail inbox for any unread trading signals from today. If you find a signal, parse the Ticker, Entry, and Stop Loss, and calculate the risk percentage."

**Expected Result 1:**
> "I found 1 new email with the subject 'Trade Alert: LONG BTC/USDT'.
> **Parsed Data:**
> - Ticker: BTC/USDT
> - Direction: LONG
> - Entry: $64,500
> - Stop Loss: $62,000
>
> **Risk Analysis:** The distance to stop loss is approximately 3.9%. This is within standard risk parameters.
> Would you like me to prepare a transaction using the Agent Wallet?"

**Prompt 2:**
> "Prepare an execution summary for the last parsed BTC signal to be sent to my Telegram alert channel."

**Expected Result 2:**
> "Here is the structured summary ready for webhook transmission:
> `🚨 NEW SIGNAL: BTC/USDT LONG`
> `Entry: 64,500`
> `SL: 62,000`
> `Risk: 3.9%`
> `Action: Ready for API execution.`"
