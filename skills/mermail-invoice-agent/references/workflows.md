# Mermail Invoice Agent — workflows

## Intake

1. Resolve the workspace and the owner-configured billing mailbox once; prefer `public_id`.
2. List or search invoice candidates with bounded metadata reads (`limit` 1–100).
3. Select one email by exact `emailId` and read it with `metadata_only` first; require clean `scan_status` before reading `agent_safe_content` body.

## Decide

Reject before acting. Apply the owner policy in this order:

```
sender allowlisted?      -> no -> rejected (sender_not_allowlisted)
amount parses?           -> no -> rejected (unparsable_amount)
amount <= threshold?     -> no -> rejected (over_threshold)
   ...candidate...
paybox connected?        -> no -> pending (wallet_not_connected)
funding >= amount?       -> no -> pending (wallet_unfunded)
owner authorized?        -> no -> pending (awaiting_authorization)
pay once, capture receipt-> ok -> paid ; unsettled -> pending (not_executed)
```

## Payment

- Call `get_paybox_connection` exactly once per candidate before any pay attempt.
- Pay only an allowlisted, in-policy, funded, authorized invoice via the live Agent Wallet / x402 path. Record the returned receipt identifier as the only `paid` proof.
- On an ambiguous result, reconcile with `paybox_get_request` once; never create a replacement payment while a request may exist.

## Proof and reply

- On `paid`: draft the same-thread reply with the receipt reference using `save_draft`; deliver with `reply_to_email` only after the owner authorizes the recipients and body.
- On `rejected` or `pending`: draft nothing unless the owner asks, then report the reason and next action in the owner-visible ledger rather than to the vendor.

## Follow-ups

- Late invoices, second statements, or resend requests reload the same ledger record and re-run the policy; a new email never bypasses the allowlist or threshold.
- Funding arrival, owner authorization, or a reconnected paybox can move a `pending` invoice to a fresh decision. Re-inspect the connection once and re-check authorization before any payment.

## Failure recovery

- Never retry a write whose outcome is uncertain. Reconcile authoritative state, then decide the next step.
- A failed paybox call stops the run with `failed`; the invoice stays `pending` until the owner fixes the environment and reauthorizes.