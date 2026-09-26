---
name: mermail-agent-handshake
description: Autonomous email negotiation skill using Mermail mailboxes for agent-to-agent procurement under a budget cap, with read-only wallet verification, halting before any payment step and leaving fund transfers entirely to human control outside the skill.
metadata:
  openclaw:
    requires:
      env:
        - MERMAIL_API_KEY
    primaryEnv: MERMAIL_API_KEY
    homepage: https://docs.mermail.app/ai/skills
---

# Mermail Agent Handshake

This skill lets an AI agent negotiate purchases with a vendor over real email using a Mermail mailbox. You give it a simple instruction like what to buy, how many units, and your budget cap, and it handles the back-and-forth negotiation automatically.

Once the negotiation finishes and both sides agree on a price, the agent checks whether your connected wallet is active, saves an audit transcript, and immediately stops. It has no ability to send money or sign transactions. Any payment has to be made manually by a human, outside of this skill.

For deeper details on safeguards and how attacks or race conditions are handled, see [references/security.md](./references/security.md).

## What the Skill Does

When you run this skill, it takes care of four main tasks:

1. **Extracts negotiation goals from plain English.** You can pass in natural instructions like `"Negotiate with vendor@example.com for 100 units of Widget X, budget cap $50"`. The agent parses out the vendor email, item description, quantity, and your maximum price.
2. **Conducts multi-turn email negotiations.** It drafts an opening offer, emails the vendor, watches the inbox for replies, and counters within your budget.
3. **Guarantees budget protection.** The agent will never agree to a unit price or total spend above the budget cap you set. If the vendor refuses to come down to your price ceiling, the agent walks away.
4. **Halts before payment.** Once an agreement is reached, the agent calls a read-only wallet tool to verify that the wallet connection is active, prints a deal summary, and halts. It does not wait for a confirmation signal to send funds, and it includes no code or tools to execute transfers. The transaction stops there, leaving payment entirely to human discretion.

## Mermail Tool Usage

The skill relies on the Mermail MCP server for mail handling and wallet inspection. The tools are divided strictly between email actions and read-only status checks.

### Email tools
- `Mermail:send_email`: Sends opening offers, counter-proposals, final acceptances, walk-away notices, and audit transcripts.
- `Mermail:list_emails`: Polls the buyer mailbox (`rewardcourt@mermail.app`) for new incoming replies matching the negotiation thread.
- `Mermail:get_email`: Retrieves message content and headers to extract vendor quotes.

### Wallet tools (read-only)
- `Mermail:get_paybox_connection`: Verifies that the connected Paybox wallet has an ACTIVE status (status only -- no balance data is returned by this tool).

### Excluded tools
Transfer tools like `Mermail:paybox_request_transfer` and `Mermail:paybox_transfer` are intentionally omitted. The skill is designed without any mechanism to move funds. Its work is complete once terms are agreed upon and recorded.

## How It Works Step-by-Step

1. **Parse instruction.** The agent pulls out the vendor email, item name, unit count, and budget cap from your prompt.
2. **Establish inbox baseline.** Before sending the first email, the agent lists existing message IDs in the mailbox. This ensures that previous emails or unrelated threads aren't mistaken for incoming vendor replies.
3. **Send opening offer.** It sends an initial email containing both a friendly note and structured protocol lines (`OFFER:`, `ROUND:`, `DECISION:`).
4. **Negotiate in rounds.** The agent polls for replies. When the vendor responds, it compares the offered price against the budget cap:
   - If the price is at or below the budget cap, it accepts.
   - If the price is higher than the budget cap and rounds remain (up to a default max of 3 rounds), it calculates a counter-offer by splitting the difference, capped at your maximum price.
   - If round 3 is reached and the vendor is still above budget, it offers its final price ceiling. If the vendor still cannot meet it, the agent sends a walk-away notice and ends the negotiation.
5. **Check wallet status.** If an agreement is reached, the agent calls `get_paybox_connection` to confirm the wallet is ACTIVE (status only -- no balance data is returned by this tool).
6. **Save audit transcript.** It compiles the entire conversation history into a markdown transcript, writes it to the local `transcripts/` folder, and emails a copy to the buyer mailbox for recordkeeping.
7. **Full stop.** The agent displays a final summary card showing the agreed terms, product details, and wallet status, then exits completely. It does not initiate payment. Any fund transfer must be done separately by a human operator.

## Examples from Live Testing

Here are three real runs demonstrating how the agent negotiates different budget constraints.

### Example 1: Standard Purchase (Deal Accepted)

Prompt:
> "Negotiate with vendor.negotiator11@gmail.com for 100 units of Widget X, budget cap $50"

How the exchange unfolded:
1. Round 1: Buyer offers $0.40/unit ($40.00 total).
2. Round 2: Vendor counters with $0.60/unit. Buyer counters with $0.50/unit (splitting the difference, right at the $50 cap).
3. Round 3: Vendor counters with $0.525/unit. Buyer holds firm with a final counter of $0.50/unit.
4. Final: Vendor accepts at its reserve floor of $0.45/unit ($45.00 total).

Outcome:
- Status: DEAL ACCEPTED
- Agreed Terms: 100 units @ $0.45/unit ($45.00 total, $5.00 below budget)
- Wallet Check: ACTIVE (status only -- no balance data is returned by this tool)
- Result: Transcript saved to disk and emailed to buyer mailbox; process terminates. The human operator can now review the transcript and issue payment manually.

### Example 2: Tight Budget Cap (Deal Accepted)

Prompt:
> "Negotiate with vendor.negotiator11@gmail.com for 100 units of Widget X, budget cap $45"

How the exchange unfolded:
1. Round 1: Buyer offers $0.35/unit ($35.00 total).
2. Round 2: Vendor counters with $0.60/unit. Buyer counters with $0.45/unit (the maximum affordable price under the $45 cap).
3. Round 3: Vendor reaches its reserve floor and accepts $0.45/unit.

Outcome:
- Status: DEAL ACCEPTED
- Agreed Terms: 100 units @ $0.45/unit ($45.00 total)
- Wallet Check: ACTIVE (status only -- no balance data is returned by this tool)
- Result: Negotiation finishes successfully and halts. Payment is left entirely to manual human execution.

### Example 3: Unrealistic Budget (Walk Away)

Prompt:
> "Negotiate with vendor.negotiator11@gmail.com for 100 units of Widget X, budget cap $40"

How the exchange unfolded:
1. Round 1: Buyer offers $0.30/unit ($30.00 total).
2. Round 2: Vendor counters with $0.60/unit. Buyer counters with $0.40/unit (budget cap).
3. Round 3: Vendor replies that it cannot go below its $0.45/unit floor. Buyer sends a walk-away notice (`DECISION: WALK_AWAY`).

Outcome:
- Status: WALK_AWAY
- Agreed Terms: None.
- Wallet Check: Skipped.
- Result: Transcript logged; negotiation terminated with zero dollars spent.
