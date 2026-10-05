# Setup and reproduction

Everything below was run end to end on a Windows laptop with Cursor on its free plan. Steps marked "not yet verified" have not been run against live data.

## 1. Mailbox and MCP connection

1. Create a Mermail account and one agent mailbox. Note its address, for example `your-agent@mermail.app`.
2. Add the Mermail MCP server to your client. For Cursor, put this in `~/.cursor/mcp.json`, then choose Authenticate and approve the workspace in the browser:

   ```json
   {
     "mcpServers": {
       "mermail": { "url": "https://console.mermail.app/mcp" }
     }
   }
   ```
3. Never paste an API key into the config file for this skill. The skill does not need one.

## 2. Install the skill

For Cursor, copy the folder into your personal skills directory and restart Cursor:

```text
~/.cursor/skills/mermail-rexdao-brief/
```

For Claude Code and Codex, follow the install steps in the repository README. Check that the skill appears in the client's skill list (in Cursor, type `/`).

## 3. Subscribe the mailbox to Snapshot

1. On snapshot.org, connect a wallet and open the email notification settings.
2. Enter the agent mailbox address. Snapshot sends a verification email to it.
3. A human opens that email in Mermail and clicks the verify button. The skill never clicks it and lists it under Not parsed.
4. Follow the spaces you care about. Turn on both **New proposal** and **Closed proposal**. If only Closed is on, the brief can only recap.
5. Wait for real notifications. Nothing arrives until a followed space opens or closes a proposal.

## 4. Run it

```text
/mermail-rexdao-brief What DAO votes need my attention this week?
/mermail-rexdao-brief Recap the Snapshot proposals that closed recently, with every result.
/mermail-rexdao-brief What is the Spark proposal about?
```

Expected shape: a status line, the scan counts, OPEN NOW, RECENTLY CLOSED, NOT PARSED. See [examples.md](examples.md).

## 5. What is and is not verified

| Behavior | Status |
| --- | --- |
| Find Snapshot emails, classify by subject, count unparsed mail | Verified on live data |
| Closed recap with results and a total check | Verified on live data |
| "No open proposals found in email" when none exist | Verified on live data |
| Open proposals ranked by time left | Not yet verified: no live New proposal email was available when this was written |
| Unsent digest or rationale draft | Not yet verified end to end |
| Scheduled reminder after preview and approval | Not yet verified end to end |

## 6. Troubleshooting

- **Only a verification email, no proposals:** the subscription is not finished or nothing has happened in your spaces yet.
- **"No open proposals found":** a correct answer when only Closed emails exist.
- **Drafts in Needs review addressed to `notify@snapshot.org`:** Mermail may create them automatically. Leave them unsent and delete them. The skill never replies to Snapshot.
- **Fewer result rows than the email shows:** the agent-safe view can omit 0% rows. The skill lists the rows it receives and writes `other choices: not in email`.
- **Odd spacing inside an excerpt:** an artifact of the safe view. The skill shows excerpts only on request and never repairs them.
