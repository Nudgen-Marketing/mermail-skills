# Tools Reference

This skill uses only Mermail MCP tools for the inbox/identity side, plus a connected browser tool for third-party form submission. No calendar or Composio toolkits are required.

## Mermail MCP tools used

- **list_mailboxes** — discover existing mailboxes in the workspace. Always call this first.
- **create_mailbox** — provision a new mailbox if none exists yet. Returns the mailbox address used as the sign-up identity.
- **list_emails** — list recent messages in a mailbox, newest first. Used as a fallback if search doesn't match.
- **search_emails** — search a mailbox for an expected sender, subject, or time window. Primary tool for polling for the confirmation email.
- **get_email** — read the full body of one matched message, including the OTP code or confirmation link.

## Optional: Agent Wallet tools

Only invoked if the target service requires payment info to complete signup (e.g. a paid free-trial). Always subject to a user-configured spend cap; if no cap exists, the skill pauses and asks for approval rather than spending automatically.

## Not used by this skill

- Composio toolkits (Calendar, Slack, etc.) — not needed for sign-up/verify flows.
- send_email / reply_to_email — this skill only reads; it does not need to send mail unless a service specifically requires a reply-to-verify flow (rare — treat as an edge case, not the default path).
