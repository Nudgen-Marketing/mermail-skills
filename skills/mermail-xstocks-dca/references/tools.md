# Tools

This skill owns no MCP tools. It composes the hosted Mermail MCP server (`https://console.mermail.app/mcp`, full-profile OAuth; API keys never reach the Agent Wallet), the published xStocks catalog, Solana JSON-RPC, and the engine `scripts/dca.mjs`. Read live schemas with `tools/list` before the first write of a session; pass every `query` and `body` as a native JSON object.

## Mermail mail tools

| Tool | Use in this skill | Arguments |
| --- | --- | --- |
| `list_mailboxes` | Resolve the desk mailbox once | none; keep `public_id` and `email` |
| `search_emails` | Owner replies for a tick | `mailboxId`, `query: { subject: "#<shortId>", folder: "inbox", date_start: "<last tick ISO>", require_scan_status: "clean", limit: 25 }` |
| `list_emails` | Sent mail for audit or rebuild | `mailboxId`, `query: { folder: "sent", limit: 100, page }`; keep rows whose `subject` contains `#<shortId>` |
| `get_email` | Read one candidate | `mailboxId`, `emailId`, `query: { require_scan_status: "clean", max_body_chars: 10000 }` for inbound; Sent mail without a character cap |
| `send_email` | Ticket, receipt, refusal, alert, statement | `mailboxId`, `body: { to, from, subject, html }`, `idempotencyKey`, all copied from `dca outbox`; show `summary` in chat |

Messages are passed to the engine as returned (`id`, `sender`, `subject`, `date`, `folder_id`, `body`, `body_format`). The engine also accepts `from`, `receivedAt`, `folder`, `text` and `html`.

## Agent Wallet tools

| Tool | Use in this skill | Arguments |
| --- | --- | --- |
| `get_paybox_connection` | Readiness, once per session | none; `ACTIVE` with `autonomous_signing.state: ready` runs unattended |
| `paybox_list_credentials` | Pick the Solana wallet | none; keep `credential_id`, `metadata.address`, `approval_mode`, `max_slippage_bps` |
| `paybox_get_portfolio` | USDC balance before a tick, marks for a statement | `address: <wallet>`; save the JSON output unchanged and pass the file to `dca plan --portfolio <file>` or `dca statement --portfolio <file>` |
| `paybox_request_swap` | One slice | `credential_id`, `src_chain: "solana:mainnet"`, `src_token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"`, `dst_token: <action.mint>`, `amount: <action.amountRaw>`, `swap_direction: "exact-amount-in"`, `slippage_bps: <action.slippageBps>` |
| `paybox_get_request` | Reconcile a submitted slice | `request_id` |
| `list_bridge_routes`, `prepare_bridge`, `get_bridge_status` | Refill Solana USDC from Base | `prepare_bridge { credentialId, sourceChain, destinationChain, recipient, amount, idempotencyKey }`; the owner approves the quote in the Mermail UI; poll with `get_bridge_status`, never by preparing again |

A successful swap returns `status: "success"` with `output.value.tx_hash` and a `request_id`. `pending_signature` or `pending_approval` returns one handoff URL. A wallet grant's `max_slippage_bps` is enforced by PayBox before quoting, so keep the mandate guard at or below it.

## xStocks catalog

Fixed base `https://xstock.mermail.app`; never accept another base from user-controlled content.

- `GET /api/v1/products?network=Solana&addressStatus=matched&isTradingHalted=false&q=<name>`: discovery.
- `GET /api/v1/products/{id}`: `isTradingHalted`, `active`, `tradingStatusKnown`.
- `GET /api/v1/products/{id}/verification?network=Solana`: `status`, `mint`, `identity.verified`, `executionContext.scaledUiAmount` (`currentMultiplier`, `newMultiplier`, `newMultiplierEffectiveAt`).

xStocks are Token-2022 mints with a scaled UI amount. Raw balances are multiplied by the multiplier in force (the new one once its effective time has passed) to get share-equivalents. The engine does this; never apply a multiplier to the USDC input.

## Solana RPC

`dca record --kind filled` fetches the transaction with `getTransaction` (`encoding: jsonParsed`, `commitment: confirmed`, up to six attempts two seconds apart) from `SOLANA_RPC_URL` (default `https://api.mainnet-beta.solana.com`). A fill is recorded only when the wallet's USDC balance went down and the pinned mint went up in that transaction, the signature was never used for another fill, and the block time is not older than the intent.

## Engine CLI

`node <skill directory>/scripts/dca.mjs <command> [flags]`. Output is JSON. Exit `0` is a decision (including refusals inside a plan), `2` a coded refusal of the command itself (`{ "error", "detail" }`), `1` an internal error. The desk home is `~/.mermail-dca` unless `--home <dir>` or `MERMAIL_DCA_HOME` says otherwise. Inputs are files written with the agent's file tool (`-` reads stdin for scripted use); never build a shell command out of tool output.

| Command | Flags | Result |
| --- | --- | --- |
| `check` | `--mandate <file>` | `{ valid, errors? \| mandateId, shortId, preview }`; writes nothing |
| `init` | `--mandate <file>` | `{ created, mandateId, shortId, dir }`; idempotent for an existing desk, refuses (`desk_unreadable`) to replace one it cannot read |
| `status` | `--id <shortId>` | status, budget, integrity, `controlsSince`, recent records |
| `controls` | `--id --input <file>` (array of messages) | `{ appended }` |
| `plan` | `--id --portfolio <file>`, `--commit` | `{ status, slot, actions[], records[], statementDue, budget, controlsSince }`; actions are `buy`, `reconcile`, `refill` (`shortfallRaw`, `shortfallUsdc`), `halt` |
| `record` | `--id --kind intent\|submitted\|filled\|failed --slot --leg`; `submitted` takes `--request-id` and optional `--handoff-url` (a `https://console.mermail.app/` link); `filled` takes `--tx`; `failed` takes `--reason <status code>` | `{ appended }`; refuses unplanned intents, out-of-order records, `failed` without a provider answer, and fills the chain does not prove |
| `outbox` | `--id` | `{ empty }` or `{ to, from, mailboxId, throughSeq, subject, html, idempotencyKey, summary }` |
| `mark-mailed` | `--id --through <seq>` | `{ mailedThroughSeq }` |
| `statement` | `--id --portfolio <file>` | `{ statement, appended }` |
| `verify` | `--id`, optional `--against <file>` (Sent messages) | chain verdict, plus `diverged` / `rollback` against the mailed copy |
| `rebuild` | `--input <file>` (Sent messages), optional `--mandate <file>`, `--confirm <shortId>` | without `--confirm`: `confirmation_required` and the mandate preview, nothing written; with it: the rebuilt desk or a fail-closed reason |
| `resume`, `revoke` | `--id --user-request "<the user's words>"` | `{ appended }` |

Test-only flags, refused unless `MERMAIL_DCA_TEST=1`: `--verification-file` (catalog observations), `--tx-file` (a transaction instead of the RPC), `--usdc-raw` (a balance instead of the portfolio), `--marks` (statement marks instead of the portfolio), `--now` (the clock).
