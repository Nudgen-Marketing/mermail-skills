# Workflows — mermail-ap-invoice-agent

See also the Workflow section in `SKILL.md`.

## Demo seed (Operator)

1. Create/use demo Mermail mailbox.
2. Send yourself 2 emails: (A) clean PDF invoice INV-1042 $125 USDC-equivalent narrative; (B) duplicate INV-1042; (C) optional spam with wallet-connect CTA.
3. Connect MCP OAuth full profile in Cursor (or chosen client).
4. Run: `Use $mermail-ap-invoice-agent to triage unread invoices and draft an owner brief. Do not pay.`
5. Show draft in Mermail UI as final result.
