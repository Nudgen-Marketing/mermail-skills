# Capability boundary

This persona owns no MCP tools. The current Python helper makes one bounded read of a fixed public market-data endpoint and formats three requested coin records. It does not call Mermail, use credentials, send mail, schedule work or implement general news scraping. `send_to_mermail` is an explicitly blocked adapter placeholder, not an MCP tool.

The intended delivery feature still needs author implementation. Resolve one authenticated workspace and mailbox through the official administration/inbox skills; direct composition belongs to `mermail-compose-email` using the exact current host-exposed tool identifier and live schema. Use native JSON query/body objects, not stringified envelopes. A recipient address alone cannot replace an authenticated sending mailbox. The restricted agent-inbox profile is not a sending capability.

Future delivery must independently preview the exact sender, To/Cc/Bcc, subject, body, attachments and timing, obtain current user approval, call once and reconcile authoritative state on an uncertain result. A saved draft, formatted stdout or completed fetch is not delivery. Do not substitute a guessed REST URL, forge a success response or retry through another surface. A recurring digest additionally requires an explicitly configured scheduler and persistent state; no scheduler is currently implemented.
