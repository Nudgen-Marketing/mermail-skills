# Refund desk tool map

This skill **owns no MCP tools**. It composes the owning skills' tools and inherits their argument,
approval, and retry contracts. Tool names below are the unqualified MCP names; some hosts expose them
host-qualified (for example `Mermail:list_emails`). Read the **live** schema from MCP `tools/list`
before a write instead of assuming a field list.

Ownership stays where `tool-coverage.json` puts it:

| Tool | Owner |
| --- | --- |
| `list_workspaces`, `list_mailboxes` | `mermail-administer-workspace` |
| `search_emails`, `list_emails`, `get_email`, `get_email_context`, `get_thread`, `move_email`, `create_custom_label` | `mermail-manage-inbox` |
| `save_draft`, `reply_to_email` | `mermail-compose-email` |
| `get_paybox_connection`, `paybox_list_credentials`, `paybox_get_portfolio`, `paybox_request_transfer`, `paybox_get_request` | `mermail-agent-wallet` |

## Read

- `list_workspaces` — `{}`. Resolve the credential-bound workspace. Never invent a `workspaceId`.
- `list_mailboxes` — `{}`; pass the exact `workspaceId` only when the live schema requires it. Prefer
  the returned `public_id` as `mailboxId`. Reject a candidate with `disabled_at`, `can_receive: false`,
  or a `receiving_status` other than `ready`.
- `search_emails` — bounded window. `query` must be a **native JSON object**, never a stringified JSON
  blob. Pass exact sender, subject terms, and `date_start`; request `metadata_only` for the candidate
  pass.
- `list_emails` — newest-first fallback when search returns nothing. The `query` rule above applies.
- `get_email` — one selected message. Request `metadata_only` for the candidate pass and the body form
  only for the selected claim; require `scan_status` of `clean` before interpreting text.
- `get_email_context` / `get_thread` — context for the **selected** message only, never for choosing
  among ambiguous candidates.
- `get_paybox_connection` — the gate for any PayBox claim. Call it once before saying PayBox is
  unavailable. Returns `ACTIVE`, `connect_handoff.console_url`, `reauth_handoff.console_url`,
  `OWNER_ACTION_REQUIRED`, or a readiness state.
- `paybox_list_credentials` — chain eligibility, `credential_id`, and `approval_mode`. Preserve an
  explicit `credential_id`; never treat a missing chain as compatible.
- `paybox_get_portfolio` — holdings. **Read the transfer asset address from here** rather than
  guessing a token address.
- `paybox_get_request` — authoritative provider state for one known `request_id`. Use it to separate
  pending from terminal; never as a reason to start another write.

## Internal reversible write

- `save_draft` — store the reply body. `body.body` is a string in the live compose schema. Saving a
  draft never sends.
- `create_custom_label` / `move_email` — case state only. These change classifier definitions and
  mailbox organization, not money.

## External effect

- `paybox_request_transfer` — **one call per eligible, approved claim.** Read the live schema first;
  pass mailbox/credential, asset (the portfolio token address, or `"native"` only when the schema uses
  that sentinel), chain, amount exactly as the schema requires, and the **ledger** destination.
  Do **not** call `prepare_destructive_action` — PayBox owns transaction policy, signing, and
  approval, and PayBox writes are not wrapped in Mermail confirmation tokens.
  Possible results: `setup_required`, `pending_execution`, `recovery_required`, `pending_approval`,
  `pending_signature`, terminal success, or an error. Only provider-confirmed terminal success is
  `paid`.
- `reply_to_email` — one customer-facing send after the outcome is known. Pass explicit `to`/`cc`/`bcc`
  and a `body` with `from` (the mailbox address) plus `html` and/or `text`. MCP does not auto-fill
  Reply All. Preview recipients and body first.

## Local (not an MCP tool)

- `scripts/refund-policy.mjs` — the deterministic eligibility engine. Pure, offline, no dependencies:
  it reads a claim, the ledger, and the policy, and prints one JSON verdict.

  ```bash
  node scripts/refund-policy.mjs --claim claim.json --ledger ledger.json --policy policy.json --pretty
  ```

  Add `--paid-this-run <n>` to apply `max_refunds_per_run`, and `--already-handled <ref,ref>` to pass
  the order references already granted in this run. `--claim -` reads the claim from stdin. Exit code
  `0` means a verdict was computed (including `needs_human` and `rejected`); exit code `2` means the
  input was unusable and the verdict is `invalid_input`.

- `scripts/verify-live.mjs` — read-only live check that the workspace is reachable and that every tool
  this workflow composes exists on the connected server. It **never** sends mail and **never** moves
  money, so it is safe on a real workspace.

  ```bash
  MERMAIL_API_KEY=… node scripts/verify-live.mjs --search "charged twice"
  MERMAIL_API_KEY=… node scripts/verify-live.mjs --catalog-only
  ```

  `--catalog-only` stops after `initialize` + `tools/list` (two calls) and is the right first check on
  a rate-limited workspace. The full check adds `list_workspaces`, `list_mailboxes`, and an optional
  `search_emails` that requests `metadata_only`. The key is read from the environment and is never
  printed. Exit codes: `0` pass, `2` no key configured, `3` catalog or check failure, `4` auth,
  `5` rate limited, `6` provider error or timeout.

## Scope, plan, and profile caveats

- `MERMAIL_API_KEY` covers the inbox read and compose tools. It **never** unlocks PayBox: Agent Wallet
  requires full-profile MCP **OAuth** with `mcp:tools`, and is unavailable on API keys and on the
  `?profile=agent-inbox` 12-tool profile. Without OAuth, the desk still completes its verified
  read/decide/reply work and reports the payout as `blocked` with the real handoff.
- `paybox_*` tools can be absent from a host's first `tools/list` and still be callable. Call
  `get_paybox_connection` once before claiming they are unavailable.
- Reads and writes consume the workspace's RPM and API credits; email sends are subject to the
  external recipient limit. Stop on `401`, `402`, `403`, or `429`; never retry a write to defeat a
  limit.
- `prepare_destructive_action` is for non-PayBox destructive Mermail tools only. Nothing in this
  workflow calls it.
