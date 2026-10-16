# Tools Reference for Mermail Payroll Agent

`mermail-payroll-agent` is a composite persona skill that orchestrates existing Mermail MCP tools across inbox management, Agent Wallet (PayBox), and email communication. It introduces no new MCP endpoints.

## Tool Allocation & Risk Classification

| Tool | Source Domain | Safety Class | Usage in Payroll Workflow |
| --- | --- | --- | --- |
| `list_mailboxes` | `mermail-administer-workspace` | Read-only | Resolves the designated `payroll_mailbox_id` and verifies mailbox health |
| `list_emails` | `mermail-manage-inbox` | Read-only | Discovers pending contractor invoices and pay requests |
| `get_email` | `mermail-manage-inbox` | Read-only | Reads email headers, authentication flags (`scan_status`), and body content |
| `download_attachment` | `mermail-manage-inbox` | Read-only | Downloads timesheets, CSVs, or PDF invoices (size-capped at 1 MiB) |
| `create_custom_label` | `mermail-manage-inbox` | Reversible write | Creates `Payroll/Staged`, `Payroll/Paid`, or `Payroll/Quarantine` labels |
| `move_email` | `mermail-manage-inbox` | Reversible write | Organizes processed billing threads into designated folders |
| `get_paybox_connection` | `mermail-agent-wallet` | Read-only | First PayBox probe. Confirms full-profile OAuth connection readiness |
| `paybox_list_credentials` | `mermail-agent-wallet` | Read-only | Verifies `approval_mode` requires human operator signing (`always_approve` or `iframe`) |
| `paybox_get_portfolio` | `mermail-agent-wallet` | Read-only | Audits USDC asset balances and verifies native SOL gas reserve (>= 0.05 SOL) |
| `paybox_request_transfer` | `mermail-agent-wallet` | Wallet Destructive | Stages the single-use transfer proposal on Solana Mainnet behind operator signature |
| `paybox_get_request` | `mermail-agent-wallet` | Read-only | Polls reconciliation status of the transfer and retrieves the on-chain signature |
| `reply_to_email` | `mermail-compose-email` | External Effect | Sends on-chain remittance advice and paystub confirmation to contractor |

## Tool Invocation Contracts

### `get_paybox_connection`
- Must be executed as the initial wallet probe before any financial calculations.
- Verifies that PayBox is active. Halts immediately if the connection requires owner re-authorization (`OWNER_ACTION_REQUIRED`).

### `paybox_list_credentials`
- Must verify that `treasury_credential_id` does NOT operate in `autonomous` mode. Unattended or autonomous payout credentials are strictly blocked by safety invariants (`AUTONOMOUS_PAYOUT_BLOCKED`).

### `paybox_request_transfer`
- Invoked exactly once per approved invoice line item.
- Argument types: Pass native JSON values and live-schema parameters.
- Idempotency key: Bound deterministically to `contractor_id:invoice_number:billing_period` to prevent duplicate double-spending.
- Stops turn on `pending_signature` to allow operator verification in the PayBox console window.

### `reply_to_email`
- Requires explicit user approval before sending.
- Never sends before on-chain confirmation is validated via `paybox_get_request`.
- Remittance email body contains: Contractor name, invoiced period, disbursed USDC amount, and the Solscan transaction link.
