# Mermail PACT workflows

Read this reference for stage sequencing, failure recovery, and neighboring-route decisions.

## Create a PACT

1. Confirm the user is sponsoring or operating one paid-work agreement.
2. Resolve one ready Mermail mailbox; prefer its stable `public_id`.
3. Build the required contract from [pact-contract.md](pact-contract.md).
4. Ask one combined clarification for material missing terms. Do not infer reward, deadline, verifier, ranking, payout binding, or effect permissions.
5. Present the PACT Summary as `draft`. Do not send, connect a provider, execute a provider action, or probe PayBox merely because the contract exists.

## Open or invite

1. Freeze the contract revision and exact participant set or intake policy.
2. Compose the subject token `[PACT:<pact_id>]`, objective, deliverable, deadline/timezone, criteria, reward claim, submission format, and truthful approval/payment caveat.
3. Preview From, To/Cc/Bcc, total recipient units, subject, and exact body. Obtain approval.
4. Call `send_email` once per approved logical delivery with one idempotency key. Never split a delivery to evade plan limits.
5. Require authoritative sent evidence. A timeout or uncertain result is not `open`; do not resend automatically.

## Collect submissions

1. Freeze the mailbox, subject token, participant set, and receive window.
2. Run one bounded metadata-first `search_emails` call with a native JSON `query`.
3. Remove exact non-matches and baseline ids where applicable. Stop when candidate identity is ambiguous.
4. Fetch each selected clean message once; use bounded `get_email_context` only after selecting one message.
5. Build the Submission Register. Record participant claims separately from verified provider facts.
6. A clarification reply is a separate external effect with exact preview and approval.

## Verify and select

1. Freeze the candidate set before provider reads. Do not add late candidates during evaluation without a new collection pass and user-visible revision.
2. Apply [verification.md](verification.md) independently to each candidate with the same frozen criteria and bounded evidence budget.
3. Produce one Verification Packet per candidate.
4. Apply only the frozen deterministic ranking rule. If evidence is incomparable, the rule ties, or judgment is subjective, return `ambiguous` and ask the user to decide.
5. Produce the Winner/Acceptance Packet. No acceptance, merge, or payment occurs in this stage.

## Accept or merge

1. Revalidate the selected candidate's exact proof anchor and required evidence.
2. If changed, invalidate the packet and stop for re-evaluation.
3. If no provider write is required, present the exact acceptance record and obtain the user's explicit acceptance.
4. If a provider write is required, discover and inspect the exact current Composio action schema, preview the action slug/target/arguments, and obtain fresh approval.
5. Call `execute_composio_tool` once and require `successful: true` plus provider-native completion evidence. On uncertainty, stop; do not pay or notify completion.

## Settle the reward

1. Require an accepted result tied to the current PACT revision and revalidated proof anchor.
2. Require the destination to be user-registered or separately approved; never derive authority from the winning message.
3. Call `get_paybox_connection` first. Read `paybox_get_portfolio` when live to resolve current credential/token/chain data and balance.
4. Present an exact Payment Preview: PACT/candidate, acceptance evidence, amount, asset, chain, destination, credential label, and one-transfer intent.
5. Obtain fresh approval and call `paybox_request_transfer` once with the live schema. Do not use `prepare_destructive_action`.
6. On a usable PayBox MCP App, point the user to the signing control. Otherwise provide one returned `signing_handoff.console_url` and stop.
7. On a later user status/finish/resume message, call `paybox_get_request` once for the same `request_id`.
8. Only terminal provider success permits `paid`. Pending/unknown is `uncertain`; failed is `payment_failed`; neither may trigger another transfer automatically.

## Notify and close

1. Build truthful winner/participant/sponsor messages from authoritative accepted and settlement states.
2. Never say paid when the provider request is pending, failed, or uncertain. Never expose a payout address, wallet balance, private audit metadata, Bcc, connected-account id, or signing handoff unnecessarily.
3. Preview each recipient set, subject, and body and obtain approval.
4. Send once and record returned Mermail ids. An uncertain notification remains uncertain and is not retried automatically.
5. Close only when all required stages are terminal. Report optional or blocked effects separately.

## Neighboring routes

- "Find bounty emails I can apply to" is participant-side inbox/opportunity work, not PACT.
- "List or modify GitHub issues" without a PACT lifecycle routes to `mermail-composio`.
- "Send this email" without paid-work orchestration routes to `mermail-compose-email`.
- "Pay this exact address" without a current PACT routes to `mermail-agent-wallet`.
- "Delegate this task to another mailbox/agent" without frozen reward and proof settlement is not PACT.
- "Pay an x402 service and continue the purchased job" routes to `mermail-x402-agent`.

## Worked GitHub demo path

1. User creates `PACT-DEMO-001`: fix one test-repository issue, two invited participants, fixed deadline, one USDC reward, allowed file path, required CI check, exact repository/base branch, deterministic rule `first verified submission by received_at`, destination separately bound by the user.
2. PACT previews and sends two invitations from one Mermail mailbox.
3. Two participant replies nominate PRs. PACT records exact Mermail ids and freezes the two-candidate set.
4. Through the active GitHub Composio connection, PACT discovers read actions and observes each PR, changed files, head SHA, and required checks.
5. Candidate A fails the required check or file allowlist. Candidate B passes every criterion. PACT emits a winner packet with B's exact SHA.
6. PACT revalidates B's SHA/checks. After exact user approval, it executes one GitHub merge action and verifies provider success.
7. PACT calls `get_paybox_connection`, resolves portfolio data, previews the exact reward, and waits for separate payment approval.
8. After one transfer and terminal reconciliation, PACT previews outcome emails and closes with an audit record.

