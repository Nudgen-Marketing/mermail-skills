# Paid signup workflows

Use the phase that matches the authenticated user’s current envelope. Do not let an earlier approval authorize a later phase.

## Phase A — Connect and freeze the job

1. Prefer full-profile OAuth `https://console.mermail.app/mcp` when payment may happen. Use `?profile=agent-inbox` only for verify-only demos.
2. Freeze service/vendor, payment-in-scope boolean, spend cap / asset / chain when paying, and OTP/link approval policy from the user request.
3. If MCP auth fails, stop and route to `mermail-mcp`. Do not invent credentials.

## Phase B — Identity (agent inbox)

Follow `mermail-agent-inbox`:

1. `list_workspaces` → `list_mailboxes`.
2. Reuse only an exact service-scoped usable mailbox; otherwise preview address + ~10 provision credits and `create_mailbox` once with verification-mode settings when supported.
3. Keep `public_id` as `mailboxId` and the returned email as the third-party signup address.

## Phase C — Baseline then external signup

1. One bounded metadata-only search/list; record Mermail email `id` baseline (not provider `message_id`).
2. Record expected sender/domain, recipient, subject set, ISO arrival-window start, and deadline.
3. Continue signup via host-allowlisted tools only. Pause for ToS, CAPTCHA, credentials, and any financial commitment.

## Phase D — Verification wait

1. Poll with `search_emails` / `list_emails` using native JSON `query` objects (`metadata_only`, `agent_safe_content`; `require_scan_status: "clean"` when exposed on full profile).
2. Default budget: ≤ ~5 logical attempts within ~2 minutes unless the user extends. Stop on `401`/`402`/`403`/`429`.
3. Drop baseline ids client-side. Post-validate exact recipient, sender/domain boundary, subject, and arrival window.
4. Zero matches → `pending`/`timed_out`. More than one → `ambiguous`. Exactly one → `get_email` then protected OTP/HTTPS extraction.
5. Fresh approval before entering/submitting/opening the secret. Do not preflight magic links.

## Phase E — Optional PayBox payment

1. Always `tools/call` `get_paybox_connection` once before any “PayBox unavailable / reconnect MCP” message.
2. On `connect_handoff` / `reauth_handoff`, paste one `console_url` and pause. On `OWNER_ACTION_REQUIRED`, ask the workspace owner to repair PayBox.
3. Read live write schema after a usable probe. Preview exact terms. Call one of: `paybox_pay_x402`, `paybox_request_transfer`, `paybox_request_swap`.
4. Do **not** call `prepare_destructive_action` for PayBox writes.
5. Pending signature: prefer usable MCP App signing controls; else paste one `signing_handoff.console_url`. Never `reopen_signing_window`. Never replacement pay for an uncertain outcome.
6. `paybox_continuation_origin_not_found` / Submit failed is not “awaiting signature.” Reconcile `paybox_get_request` once; if origin missing, wait for fresh user authorization of one new write.
7. Claim `success` only from terminal PayBox success for that request — never from chat narration or a receipt email alone.

## Phase F — Receipt email + Signup receipt

1. Bound-search the same mailbox for vendor receipt / invoice / order-status mail after payment or after the user confirms checkout completed elsewhere.
2. Summarize non-secret fields only (vendor, amount, currency/asset, order id if present, status).
3. Emit the **Signup receipt** block from `SKILL.md` Output Conventions.

## Demo video beats (2–5 min, English)

Film a live host (Cursor / Claude / Codex / OpenClaw / Hermes), not slides-only. Hit all listing beats:

1. **Prompt** — paste a single prompt that names the skill, vendor, and pay/verify envelope.
2. **Mermail connect/use** — show MCP tools resolving a mailbox and/or `get_paybox_connection`.
3. **Complete workflow** — verification extract and/or one approved PayBox write with visible preview.
4. **Final result** — show the Signup receipt block in chat (redact secrets on screen).

Suggested film prompt:

```text
Use $mermail-paid-signup for a Demo Vendor signup on Mermail.
1) Provision or reuse a verification mailbox.
2) Wait for the verification email and extract the OTP — stop before submitting it.
3) After I approve, pay this exact x402 URL up to 1 USDC on Base with Agent Wallet.
4) Find the receipt email in the same mailbox and print a Signup receipt.
```

Post on X tagging @Mermailapp. Keep secrets off-camera.

## Phase routing cheat sheet

| User intent | Stay here? | Else route |
| --- | --- | --- |
| Signup + verify (+ optional pay + receipt) | Yes | — |
| Verify / expected mail only | Yes (payment `not_requested`) or `mermail-agent-inbox` | — |
| Isolated wallet inspect/fund/transfer/swap/x402 pay | No | `mermail-agent-wallet` |
| Pay x402 then continue original non-signup job | No | `mermail-x402-agent` |
| Generic inbox cleanup | No | `mermail-manage-inbox` |
