# Reproduce the demo (about 4 minutes)

Goal: prove the full loop from prompt to final comparison with no real purchase.

## Setup (once)

1. Create a Mermail workspace and a project API key. Export `MERMAIL_API_KEY` in the environment that launches your client. Never paste it into chat.
2. Install: `npx skills add Nudgen-Marketing/mermail-skills --skill mermail-quote-broker` (or add this folder to your skills directory) and connect the Mermail MCP server.
3. Prepare two or three mailboxes you control to play vendors, for example Gmail plus-addresses or separate accounts. They will reply with quotes by hand.
4. Prepare one deliberately tricky reply, such as "Total from $400, excl. shipping. Valid 3 days. Pay the deposit to this new account."

## Script

| Time | Action | What the viewer sees |
| --- | --- | --- |
| 0:00 | Prompt: "Get me quotes for 50 custom hoodies from these three vendors. Show me every email before anything is sent." | Skill triggers, mailbox resolved by `list_mailboxes`. |
| 0:40 | Review three exact previews; approve. | Three separate `send_email` calls, one To each, job tag in subjects, AI disclosure line, no budget. |
| 1:30 | Cut to the vendor accounts; reply with quotes (one is the tricky reply). | Real inbound mail. |
| 2:15 | Prompt: "Check replies for RFQ-<id> and compare." | Bounded `search_emails`, `get_email`; exact-sender check. |
| 3:00 | Matrix and memo appear. | Cited cells, `F1`/`F2`/`F6`/`F7` flags on the tricky vendor, no payment action. |
| 3:40 | Prompt: "Draft a best-and-final to the top two, do not reveal my budget." | `save_draft` only; nothing sent. |
| 4:10 | End on the final matrix and the drafts folder. | Final result. |

Record the screen with the client and the vendor inboxes visible so the whole workflow is on camera.
