# Context bridge tools

This skill owns no MCP tools. It reuses these exact catalog tools; ownership stays with `mermail-manage-inbox` and `mermail-compose-email`.

Pass MCP `query` values as native JSON objects, never stringified JSON. Prefer mailbox `public_id` as `mailboxId`. The handoff emails are addressed to the agent's own mailbox address.

| Tool | Owner | Use in this workflow |
| --- | --- | --- |
| `search_emails` | mermail-manage-inbox | Find handoffs by the `[handoff]` marker or a specific code (`subject` contains the code); also the collision check before sending. |
| `get_email` | mermail-manage-inbox | Fetch the newest matching note body on resume; re-read after a clear to verify. |
| `send_email` | mermail-compose-email | Mail the handoff note to the agent's own address (`to` = the mailbox address, `from` = the mailbox address). |
| `delete_email` + `prepare_destructive_action` | mermail-manage-inbox | Clear one handoff: the confirmation tool issues a single-use token bound to the exact tool and message id, then `delete_email` executes once. |

Search reads are bounded (`agent_safe_content` for inbound; the handoff note is the agent's own content and may be read raw). Deletion is the only destructive operation and always follows the manage-inbox confirmation contract.
