# Reproduce the workflow

## Offline calculator example

From this skill directory:

```bash
node scripts/reconcile.mjs assets/demo-ledger.json --markdown
```

The fixture contains four synthetic records: a 100 USD invoice, an 80 USD
payment receipt, a 20 USD credit note, and a duplicate of the receipt. Expected
result: reported balance 0 USD, one duplicate ignored, all four source IDs kept.
This checks the local calculation, not Mermail connectivity or settlement.

## Connected inbox demonstration

Prerequisites: a Mermail account, an owned workspace/mailbox that can receive
mail, a connected MCP client, and Node.js 22+ if using the helper. No wallet or
actual payment is required. Follow the official
[quickstart](https://docs.mermail.app/quickstart) and
[client connection documentation](https://docs.mermail.app/ai/mcp).

1. Use an empty demonstration mailbox. From an account you control, send four
   clearly fictional messages with subject prefix `[SYNTHETIC DEMO]`:

   | Type | Document ID | Invoice ID | Amount |
   | --- | --- | --- | --- |
   | Invoice | DEMO-100 | DEMO-100 | 100.00 USD |
   | Payment receipt | DEMO-PAY-80 | DEMO-100 | 80.00 USD |
   | Credit note | DEMO-CREDIT-20 | DEMO-100 | 20.00 USD |
   | Duplicate payment receipt | DEMO-PAY-80 | DEMO-100 | 80.00 USD |

   Each body must explicitly say it is synthetic and no purchase or payment
   occurred. For the illustrative document itself, mark its event as confirmed.
   Do not impersonate a real vendor. Sending fixtures is a separate, explicit
   user-authorized setup action; the reconciliation skill never sends them.
2. Confirm the messages arrived. Invoke the skill with this prompt, replacing
   the mailbox and dates with the real demonstration scope:

   > Use $mermail-reconcile-receipts to reconcile the SYNTHETIC DEMO billing
   > emails in my selected demo mailbox received today. Read at most 25 bodies.
   > Show exact source IDs, duplicates, and missing evidence. Do not send mail,
   > change messages, or make payments.

3. Show actual MCP `list_mailboxes`, `search_emails`, and selected `get_email`
   results. The skill must use the actual returned scan/authentication state,
   source IDs, and sender domain. Never replace unknown or skipped results with
   `clean`/`pass` to match the fixture. If a gate blocks content, demonstrate the
   truthful review result and repair setup separately if needed.
4. Let the agent extract a local input ledger and run the helper. Inspect the
   real report. If all four messages qualify, expect 100 invoiced − 20 credit −
   80 reported paid = 0, with the duplicate counted once. Verify the four real
   source IDs match the inbox. If they do not qualify, record that outcome;
   never substitute the offline fixture as a live demonstration.
5. Record a 2–5 minute video in English: triggering prompt, connected MCP calls,
   inbox evidence, the completed report, and the duplicate finding. Keep the
   “synthetic sample data / real MCP workflow” distinction visible. Show no API
   keys, OAuth tokens, account settings, or unrelated/private mail.

Suggested three-minute recording: 0:00–0:25 problem and synthetic sample inbox;
0:25–1:00 triggering prompt and connected tools; 1:00–2:15 real reads and helper
execution; 2:15–3:00 source-linked result, duplicate handling, and how to reuse.
Use actual results and label edits; a slide or code walkthrough alone does not
prove the workflow works.

## Submission evidence

For a skill contest, link the public skill PR and actual recorded workflow.
Describe the AI client actually used and which calls ran. Separate offline
tests from live MCP validation. A video that has not been recorded or posted
must remain pending; do not put a placeholder URL in a submission.
