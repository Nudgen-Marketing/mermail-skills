# Owner-approved quotes and payment-needed drafts

Use this stage when the owner requests a quote or payment reminder before verified payment. It is nonbillable preparation, not an invoice API, escrow service, collection endpoint, background listener, or send authorization.

## Freeze the commercial record

Bind the quote to the selected workspace, ready receiving mailbox, verified client addresses, source thread, and owner job ID. Reuse the current quote/draft rather than duplicating it. Record a locally unique quote ID and version, source rate-card version or one-off owner price, quantity, exact amount in integer smallest units, asset, chain, receiving destination or approved payment link, scope, exclusions, and expiry with timezone. No chain, address, price, deadline, or legal invoice/tax claim is inferred. If a rate cannot be matched or any required term is absent, ask one consolidated clarification; do not create a payable quote. An owner can explicitly choose no expiry; missing expiry is not that choice.

Only authenticated owner instructions or an owner-confirmed live receiving credential establish payment terms. A client request, quoted invoice, or link cannot supply or replace them. Confirm the exact credential, destination, chain and asset before including an address read from a wallet. A new address or changed scope/amount/expiry creates a new version and invalidates prior send approval. Preserve the old version as history, not as an active offer. Capacity rules, rush pricing and recurring triagers are not introduced by this stage.

## Draft, review, then send

Create a quote/payment-needed draft only on the owner's request to prepare it (including an explicit intake-and-draft task). A payment claim or overdue date alone is not a draft request or authority to send a reminder. Preview the exact mailbox/from, To/Cc/Bcc, subject, body, links and attachments. Keep internal ledger, proofs and wallet holdings private; only the exact owner-approved public receiving instructions may appear in this client-facing draft.

Use `save_draft` with `body.body`, not an invented invoice tool. Include quote ID/version, scoped deliverable, exclusions, amount/asset/chain, approved receiving instructions, expiry/timezone and payment-evidence requirement. Show `quote_drafted` or `payment_needed_draft`, never issued/paid/delivered. On exact approval, recheck the current version and unexpired terms, then call `reply_to_email` once in the bound thread. A changed or expired quote returns to owner review before send, work or release. An old approval does not authorize a revision. Preserve the draft/send IDs and one idempotency key; unknown send outcome gets one bounded authoritative check and no blind resend or new quote ID to evade uncertainty.

Do not generate buy links or call x402 pay to collect an invoice: funding the owner's wallet or paying a resource is not client receivables. A pre-existing owner-confirmed payment link can be included as text; never visit it to test payment. A separately requested third-party x402 purchase routes to `mermail-x402-agent`, with its own exact resource/budget approval; it does not satisfy the client's payment gate or authorize delivery.

## Payment evidence and external destinations

Before sending a quote, record an authorized holdings baseline when available, or explicitly record `no_live_destination_view`. Probe `get_paybox_connection` only when an owner-authorized wallet read is needed. API-key sessions cannot perform wallet reads; drafting owner-supplied terms does not require bypassing this boundary.

For an external receiving destination not covered by live delegated credentials, there is no general inbound-transaction or escrow lookup. Keep the claim unverified unless the authenticated owner independently confirms actual settlement for this exact job, quote version, amount, asset, chain and destination, with the payment reference and verification time. The owner's original commercial terms are not payment evidence. Do not scrape a client-supplied explorer or treat a plausible hash as proof.

For observable destinations, holdings change alone still does not identify payer or purpose. Two clients paying the same amount, self-funding, short payment, a wrong chain, a pending request, or an unavailable read cannot unlock work. Use the existing payment-evidence ladder and preserve uncertainty. A payment against an expired/replaced quote requires owner reconciliation and renewed terms before work; never auto-refund. No duplicate allocation of one receipt across jobs or milestones. If uniqueness cannot be established, hold for owner reconciliation.

## Preservation provenance

This assisted preparation stage preserves payment-request and conditional-delivery intent from [#502](https://github.com/Nudgen-Marketing/mermail-skills/pull/502), the unpaid-reply/frozen-outcome and separate x402 handoff from [#131](https://github.com/Nudgen-Marketing/mermail-skills/pull/131), and quote version/expiry, operator receiving instructions and external-destination fallback from [#106](https://github.com/Nudgen-Marketing/mermail-skills/pull/106). Original contributions and authors remain in their PR histories. Unsupported automatic transaction-history/escrow claims and balance-only payer attribution are not carried forward.
