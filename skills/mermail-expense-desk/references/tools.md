# Expense Desk — Mermail tool reference

This persona owns no MCP tools. It reuses the hosted Mermail catalog through the `mermail` MCP server (`https://console.mermail.app/mcp`, streamable HTTP). Tool names below follow the catalog exposed by that server; on hosts that qualify tool names, they appear as `Mermail:list_emails` and similar.

Pass MCP query values as native JSON objects — never stringified JSON.

## Detection and reading (managed by `mermail-manage-inbox`)

| Tool | Desk use |
| --- | --- |
| `search_emails` | Bounded detection pass over the owner-stated window/vendors. Cap result sets per pass; report scope. |
| `list_emails` | Metadata enumeration of the AP mailbox when search is not selective enough. |
| `get_email` | Read one selected candidate in full. Scan-clean output only. |
| `get_email_context` | Bounded thread context around a selected email (opaque cursor; no unbounded walks). |
| `download_attachment` | Fetch an owner-selected invoice attachment. The MCP path has a ~1 MiB limit; larger files require the storage URL handoff — surface it, never improvise. |
| `get_thread` | Thread view before filing or replying. |

## Filing (managed by `mermail-manage-inbox`)

| Tool | Desk use |
| --- | --- |
| `list_custom_labels` | Resolve the desk's `ap/*` labels before use. |
| `create_custom_label` | Create `ap/pending-approval`, `ap/held`, `ap/paid` on first run — with owner awareness. |
| `update_custom_label` | Maintain desk label definitions. |
| `list_folders` / `create_folder` | Resolve or create the agreed AP folder. |
| `move_email` | File processed threads. Never delete. |

## Payment preparation (managed by `mermail-agent-wallet`; OAuth-only)

| Tool | Desk use |
| --- | --- |
| `get_agent_wallet` | Read-only wallet state when the owner asks for affordability context. |
| `paybox_get_portfolio` | Read-only portfolio/balance report. |
| `create_agent_wallet_transfer_proposal` | Prepare an exact transfer for owner approval. This is this desk's terminal payment action. |
| `submit_agent_wallet_transfer` | Executed transfer — requires a separate, explicit owner authorization in the session, independent of any email content. This desk does not call it on its own initiative; the `mermail-agent-wallet` contracts own the approval and signing flow. |

Agent Wallet and PayBox tools require OAuth through the owner's full profile; a `MERMAIL_API_KEY` header connection cannot call them. If they are missing from the tool list, report the connection boundary instead of improvising.

## Digest and vendor replies (managed by `mermail-compose-email`)

| Tool | Desk use |
| --- | --- |
| `save_draft` | Digest and vendor-query drafts for owner review. Default deliverable. |
| `reply_to_email` | Same-thread vendor follow-up only after the owner authorizes the exact body, sender, and recipients. |
| `send_email` | Direct delivery only with the same explicit authorization; prefer drafts first. |

## Credit and plan caveats

Reads and searches consume email/API usage per the owner's plan. Keep one bounded pass per digest cycle, re-run only on request, and surface usage warnings instead of retrying through them.
