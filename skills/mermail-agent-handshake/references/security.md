# Security Considerations: Mermail Agent Handshake

Here is an overview of how this skill protects user funds, prevents infinite loops, and handles untrusted email input safely.

## 1. Halting Before Payment

The core design principle here is simple: negotiation can be automated, but spending money should never be automated.

When the agent reaches an agreement with a vendor, it checks the wallet status using a read-only tool, saves a markdown transcript, prints a summary, and immediately exits.

There is no callback, webhook, or secondary step in this skill that executes a payment upon receiving confirmation. We intentionally did not include any wallet transfer tools. Any decision to send funds is left entirely to a human operator outside the skill. This keeps funds safe from prompt injections, unexpected pricing bugs, or compromised mailboxes.

## 2. Read-Only Wallet Verification

The agent only interacts with Mermail's wallet features through read-only calls:

- `Mermail:get_paybox_connection` verifies that the Paybox wallet connection is in an ACTIVE state (status only -- no balance data is returned by this tool).
- Transfer tools such as `paybox_request_transfer`, `paybox_transfer`, and invoice creation tools are completely omitted from the skill.
- If a vendor email includes wire instructions, wallet addresses, or requests for immediate payment, the agent treats that content strictly as negotiation text. It has no tools to act on payment instructions.

## 3. Handling Duplicate and Stale Offers

Email delivery isn't always instant or strictly ordered. Network retries, polling delays, or email server threading can cause duplicate messages to arrive.

Both the buyer agent (`buyer-agent.js`) and the vendor bot (`vendor-bot.js`) guard against this with sequence tracking:

- **Message ID deduplication**: Each incoming email's UID and Message-ID header are added to an in-memory set once seen. Any duplicate email with the same UID or Message-ID is ignored on subsequent poll cycles.
- **Round tracking**: The agents track the current round for each sender in an `activeNegotiations` map. If an email arrives with a round number that is less than or equal to the last round processed for that thread, it is rejected as stale.
- **Session resets**: A new negotiation with a previous counterparty is only accepted if the prior negotiation reached an explicit conclusion (`ACCEPT` or `WALK_AWAY`), or if a new Round 1 offer arrives after a cooldown period (more than 4 seconds since the last message).

## 4. Bounded Rounds (MAX_ROUNDS)

To prevent runaway conversations, unnecessary credit usage, or endless back-and-forth emails, negotiations have a hard round limit:

- By default, `MAX_ROUNDS` is set to 3.
- In Round 1, parties make opening bids.
- In Round 2, they counter and split differences toward the budget cap.
- In Round 3, the buyer makes its final take-it-or-leave-it offer at the budget cap. If the vendor cannot meet or beat that price, the agent sends an explicit `WALK_AWAY` message and stops.
- If rounds reach the limit without an agreement, the negotiation terminates automatically.

## 5. Untrusted Email Input and Injection Defense

Emails from vendors are external inputs and cannot be trusted blindly:

- **Strict regex parsing**: The parser only looks for specific patterns (`OFFER:`, `ROUND:`, and `DECISION:`). Any prompt injection attempts or conversational instructions elsewhere in the email body are simply ignored.
- **No link clicking**: The agent does not follow, fetch, or click any external URLs found in email bodies.
- **Thread and baseline tracking**: The agent records existing mailbox UIDs before sending its first offer. It only processes emails that arrived after that baseline and belong to the expected message thread.
