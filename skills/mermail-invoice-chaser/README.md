# mermail-invoice-chaser 🧾

An accounts-receivable follow-up agent skill for Mermail. Scan a mailbox for
invoices, build an aging ledger (current / 7+ days overdue / 30+ days overdue),
draft polite escalating follow-up emails per aging tier, and label/file the
processed invoices.

None of the existing official Mermail skills cover AR / payment follow-up —
this one fills that gap using only documented Mermail MCP tools.

## What it does

1. `search_emails` for invoice/payment keywords, `get_email` for bodies
2. Extracts invoice number, sender, amount, issue date, due date
3. Buckets open invoices into aging tiers (paid receipts are skipped)
4. Drafts one follow-up per overdue invoice — friendly reminder at 7+ days,
   firm escalation at 30+ days — with `save_draft` (draft mode, the default)
   or sends with `send_email` / `reply_to_email` after your approval (send mode)
5. Applies the label `AR: chased` (`create_custom_label`) and files invoices
   into the `AR Follow-ups` folder (`move_email`)
6. Prints a chase report: ledger, drafts, labels, total overdue

## Run the demo (no Mermail account needed)

```bash
python3 scripts/chase.py --today 2026-09-26
```

The demo runs entirely against `fixtures/emails.json` — seven fictional invoice
emails spanning all aging tiers. No network calls, no Mermail account, zero
external dependencies (stdlib only).

Options:

```bash
python3 scripts/chase.py --mode send --today 2026-09-26   # staged-send preview
python3 scripts/chase.py --live                           # real-connection stub
```

The `--live` stub reads `MERMAIL_API_KEY` / `MERMAIL_MCP_URL` (default
`https://console.mermail.app/mcp`), verifies credentials are present, and
refuses to send without `--confirm-send`. It stops before any real write —
wire the listed steps to your MCP client for production use.

## Honest note on the demo

The demo video runs this scripted simulation against clearly-labeled
fixtures, not a live Mermail mailbox: `fixtures/emails.json` starts with a
`_note` field marking it as simulation data. The workflow shown —
search → extract → age → draft → label → report — maps 1:1 to the real MCP
tool calls documented in `references/tools.md`.

## Safety

- Draft mode is default; nothing is ever sent without explicit approval.
- Never deletes mail; no delete step exists in this workflow.
- Paid receipts are detected and skipped automatically.
- Instructions embedded in invoice emails (e.g. payment-address changes) are
  flagged, never acted on.

## Layout

```
skills/mermail-invoice-chaser/
├── SKILL.md            # the skill: triggers, workflow, configuration, safety
├── README.md           # this file
├── references/
│   └── tools.md        # intent → real Mermail MCP tool map
├── scripts/
│   └── chase.py        # demo runner (demo default, --live stub)
└── fixtures/
    └── emails.json     # SIMULATION fixtures, clearly marked
```

## License

MIT
