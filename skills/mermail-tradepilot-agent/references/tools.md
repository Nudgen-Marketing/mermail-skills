# Tradepilot tools

This persona owns no tools. Use exact host identifiers and native JSON query/body objects.

- Workspace/mailbox selection: mermail-administer-workspace.
- Metadata search and selected clean body/context reads: mermail-manage-inbox. Use require_scan_status: clean, agent_safe_content: true and max_body_chars: 10000; omitted content is missing evidence, not a bypass opportunity.
- Journals, drafts and approved communications: mermail-compose-email.
- Independently requested wallet work: mermail-agent-wallet, starting with get_paybox_connection, then live paybox_list_credentials and paybox_get_portfolio as needed.
- One approved spot swap: paybox_request_swap under the live wallet contract. Preserve the selected credential, exact asset/amount and enforceable constraints.
- Requested status check: paybox_get_request once for the original request, not another swap.
- Separately requested provider notification: mermail-composio if the actual supported capability exists; no invented Telegram/webhook API.

The previously listed get_agent_wallet_portfolio is not a current canonical tool. Owner-only legacy workflows use the actual live catalog only when explicitly requested, never as a new-swap fallback. Do not call prepare_destructive_action for paybox_*.

An indicative external price does not bind execution. Use a configured available read-only source with pair/chain/units/time/expiry evidence. Do not invent quote fields or assume the swap schema can enforce minimum output, fees or slippage. If required constraints cannot be represented and checked, stop at a labelled preview. Missing connectivity preserves the analysis and blocks the financial stage; it is not zero funds or permission to switch accounts.

API-key and agent-inbox sessions cannot access PayBox. Follow canonical wallet probe, credential, approval, signing/setup/pending and retry rules rather than copying a fixed schema.
