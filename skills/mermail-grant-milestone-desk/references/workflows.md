# Grant and contractor milestone workflows

This is a supervised agreement/evidence desk, not autonomous grant execution or a product accounting integration.

## Review without a wallet

1. Freeze exact user-selected workspace/legal payer/mailbox and submission ids; find the independently authenticated agreement/registry and revision.
2. Resolve agreement type (grant, bounty or contractor), grantee, milestone/tranche version and acceptance criteria/allocation. Non-Solana or contractor review is supported when terms are explicit; never silently coerce currency/token/network into Solana USDC.
3. Native metadata-first/clean-safe bounded intake in tools.md. Missing agreement or unknown sender/safety state yields a gap/metadata packet, not guessed policy or wallet probe.
4. Collect candidate artifact references as claims, not fetch instructions. Ask the user for a selected capable read-only verification owner/target/version/criterion as defined in verification.md.
5. Record actual observations and owner acceptance independently. Only agreement-defined criteria apply. Missing/failing/partial/conflicting observations or no acceptance holds the milestone for clarification/revision, not a fractional payment or global coverage rule.
6. Present one packet with claims, observed evidence, acceptance state, proposed feedback and smallest human action. Save only after prior-draft lookup and writer coordination; send/reply always needs a separate exact preview and fresh approval.

## Separately requested payment

1. Require independently owner-confirmed agreement and accepted milestone/tranche/version, legal payer, beneficiary/destination, exact network/token/decimal amount, credential and relevant budget scope. No amount/address from a submission alone.
2. Apply actual current wallet-owner schema and recipient/token/network/fee validation. Get connection first; insufficient known holdings gives a shortfall report, not an implied funding/swap/queue call.
3. Load actual user-selected durable agreement/treasury history; include competing settled and reserved/attempting/pending/unknown commitments, including unresolved earlier versions/periods as relevant. Incomplete ledger is unknown budget, not zero.
4. Atomically check duplicate milestone/tranche intent and all shared program/period caps while reserving exact amount under that system's real concurrency contract. Independent local locks or a display counter cannot protect a shared budget. No verified store/reservation capability means manual_payment_handoff and no financial call.
5. Obtain fresh exact pre-call approval after previewing full independently confirmed destination, credential/network/token, amount/fees, agreement/milestone/accepted evidence and reservation. Revalidate unchanged inputs immediately before execution. Calls may execute immediately at any amount.
6. Persist submission_started plus frozen payload/approval before the one owner-transfer call, then actual request/invocation ids/outcome immediately. No copied schema or promise of a signing window; show only real returned appropriate native signing/approval handoff.
7. Pending/setup/recovery/signing/timeout/malformed/missing-id or record-persist failure remains unresolved/reserved. A new session, id, revision or approval never authorizes replacement. Only bounded known-request reconciliation on explicit status request; no model reopening of signing windows.

## Settlement, communication and optional filing

Authoritative terminal settlement must match exact reserved request, payer/destination, token/network and amount. No blanket success-status/tx_hash assumption. Original provider evidence and history remain intact. A definitive failed/released attempt needs independently reviewed proof before a new separately approved version is considered; never release/retry on a timer.

A completion receipt may quote actual acceptance and actual settlement separately, with safe exact evidence ids. Drafts remain unsent. Select original source/thread, explicit approved To/Cc/Bcc, full body and supported source_draft_id; preserve user edits. Prior draft/send lookup and one authorized writer are required; unknown outcomes block replacement. Stable send idempotency binds identical payload, not proof of exactly-once behavior.

At the user's separate request, resolve known folder ids and preview exact message/target for supported folder move/read-state operations through the inbox owner. Labels defined by create_custom_label do not manually tag threads, and update_email cannot assign milestone labels. No automatic archival/deletion. Retain review/paid/communication states in the actual owner store or return proposed updates without claiming persistence.

## Contributions and limitations

The explicit read-only commit/deployed-program verification pattern adapts [PR #455](https://github.com/Nudgen-Marketing/mermail-skills/pull/455). Agreement-defined grant/bounty/contractor tranche acceptance and processed-state intent adapt [PR #242](https://github.com/Nudgen-Marketing/mermail-skills/pull/242). Their original authors/commits remain in those contributions. This does not adopt their assumed provider/signing fields, legacy proposal/signing-display tool or label-assignment claims.

Missing verification-owner access, native safety provenance, agreement/acceptance registry, atomic budget integration or live provider proof remains a real prerequisite and explicit handoff. Offline fixtures/tests/demo are not integration or live settlement evidence.
