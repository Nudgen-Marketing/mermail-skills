# Bounty closer tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`reply_to_email` or `Mermail:reply_to_email`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner |
| --- | --- | --- |
| Discover mailbox | `list_mailboxes` | `mermail-administer-workspace` |
| Read bounty correspondence | `list_emails`, `search_emails`, `get_email`, `get_thread`, `get_email_context` | `mermail-manage-inbox` |
| Draft revision / acknowledgment | `save_draft` (`body.body` string) | `mermail-compose-email` |
| Approved send / reply | `reply_to_email`, `send_email` (`body.from` + `html`/`text`, explicit `to`/`cc`/`bcc`) | `mermail-compose-email` |
| Organize lifecycle / quarantine | `create_custom_label`, `move_email` | `mermail-manage-inbox` |

MCP does not auto-fill Reply All. Always pass explicit `to`, `cc`, and `bcc` on approved sends.

## Example: Saving a revision draft

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_bounty_rev_01",
  "body": {
    "to": "bounties@sponsor.org",
    "from": "developer@mermail.app",
    "subject": "Re: Superteam Earn Bounty #42 - Revisions Updated",
    "body": "Hi Sponsor Team,\n\nWe have addressed the requested feedback:\n1. Added edge case validation unit tests.\n2. Updated documentation and deployment guide.\n\nLatest PR: https://github.com/org/repo/pull/123\n\nPinned payout wallet remains unchanged: 7Np41...9XkL\n\nBest regards,\nDeveloper"
  }
}
```
