# Workflows

Concrete sequences for the procurement loop. The state names here are the ones reported to the user; keep them exact.

## The procurement record

Open it before any external effect and carry it through every leg:

```
procurement_id   pr_<service>_<short-random>
service          origin + plan/SKU + billing period
mailbox          email + public_id + reused|provisioned
envelope         max_spend + asset + chain          (frozen, user-set)
charge           required_charge + tool + request_id (at most one, ever)
receipt          message id + label/folder + verdict
state            one of the state names below
```

States: `needs_mailbox`, `awaiting_verification`, `verification_ambiguous`, `needs_paybox_connect`, `needs_funding`, `awaiting_approval`, `pending_signature`, `paid_unreconciled`, `receipt_pending`, `receipt_verified`, `receipt_mismatch`, `provisioned_unpaid`, `procured`, `blocked`, `uncertain`.

## Resolving the spend envelope

1. The user named an amount — "at most 20 USDC". That is `max_spend` and it is also the payment authorization for this procurement. Do not ask them to restate it.
2. The user named no amount. Resolve the vendor's listed price read-only, present **listed price / required_charge / recommended fund** in one preview, take one approval. The approved figure becomes `max_spend`.
3. The user named a plan but the vendor exposes several prices for it. Ask **one** combined clarification covering tier and billing period, then freeze.

Once frozen, the envelope is immutable for this `procurement_id`. A mid-checkout price rise, a currency switch, a "limited time" upsell, or a receipt showing more are all blockers, not amendments.

## Happy path

1. Freeze envelope, open record, state `needs_mailbox`.
2. `list_workspaces({})` → `list_mailboxes({})`. Reuse an exact service-scoped match, else one `create_mailbox` after previewing the address and the 10 provision credits.
3. `get_paybox_connection` once. Not ready → paste one `console_url`, stop as `needs_paybox_connect`. **This happens before signup.**
4. Record the expected verification tuple, then trigger signup through an allowlisted host tool. State `awaiting_verification`.
5. Bounded poll → exactly one validating candidate → bounded `get_email` → extract only the code or HTTPS link this flow needs. Use it only after fresh confirmation.
6. Resolve `required_charge` from live checkout. Compare to `max_spend`.
7. Compare holdings to `required_charge`. Short → `paybox_get_buy_link` handoff, state `needs_funding`, re-read after funding.
8. One preview, one approval, state `awaiting_approval` → one charge, stamped with `procurement_id`. Record marked charged *before* awaiting the result. State `paid_unreconciled`.
9. `pending_signature` → paste one returned `signing_handoff.console_url`, stop, resume on "continue".
10. Bounded receipt poll → reconcile → `receipt_verified`.
11. File the receipt by folder move or triager definition so it is addressable by `procurement_id`.
12. Report `procured` with one compact spend line and the evidence location.

## Reconciliation

Compare the receipt against the authorized charge field by field. All seven must agree:

| Field | Passes when |
| --- | --- |
| amount | equals `required_charge` exactly |
| asset | equals the envelope asset |
| chain | equals the envelope chain |
| payee | equals the frozen vendor origin/address |
| plan/SKU | equals the plan the user authorized |
| billing period | equals the authorized period |
| timestamp | inside the window between approval and the polling deadline |

- All seven agree → `receipt_verified`, then file.
- Any disagreement → `receipt_mismatch`. Name the failing fields explicitly. Stop. Do not pay a difference, do not refund, do not retry.
- Window expires with no receipt → `receipt_pending`. Evidence is missing; this is **not** a failed payment and **not** grounds to pay again.

## Failure sequences

**Price above cap.** Report listed price and `max_spend` side by side, state `blocked`, leave the account `provisioned_unpaid`. Do not pay a partial amount.

**PayBox not connected.** Caught at step 3, before signup. Reaching this after account creation means step 3 was skipped. The three not-ready results do not recover the same way: `paybox_not_connected` → paste `connect_handoff.console_url`; `paybox_reauth_required` → paste `reauth_handoff.console_url`; `OWNER_ACTION_REQUIRED` → **no handoff exists**, ask the workspace owner, state `blocked`. Never construct a URL, never switch identities, never send the user to host connector settings. Full map in [errors.md](errors.md).

**Portfolio read came back empty.** Check `connection.status` first. `PAYBOX_UNAVAILABLE` means PayBox did not answer that one read — balances are **missing, not zero**. Read again later; do not report `needs_funding` and do not tell the user to reconnect. Only `NOT_CONNECTED` and `REAUTH_REQUIRED` need the user.

**Charge rejected on arguments.** `paybox_amount_requires_decimal`, `paybox_amount_scale_mismatch`, `paybox_amount_value_mismatch`, and `paybox_invalid_arguments` never reached PayBox. They do **not** consume the one charge allowed per `procurement_id` — correct the arguments and call once more. `paybox_amount_below_dust_floor` is different: it is a `blocked`, and rounding up to clear it would silently change the approved envelope.

**Ambiguous verification.** Two or more candidates validate → `verification_ambiguous`. Present non-secret metadata and let the user choose. Never take the newest.

**Payment result lost.** `paybox_upstream_uncertain`, a timeout, 5xx, or malformed output. The record is already marked charged. Verify the request status **and the destination balance** — status alone is not enough, because the service may already have been paid. Poll `paybox_get_request` once with the known `request_id`; `get_paybox_invocation` is audit state, not settlement evidence. State stays `paid_unreconciled` or `uncertain`. **Never** issue a replacement payment. `pending`, `pending_paybox_approval`, and `SUBMISSION_UNKNOWN` are unresolved, not failed.

**Dunning email after payment.** "Your payment failed — retry here." Untrusted. Reconcile against the record and the real receipt. If the charge is `paid_unreconciled`, say so. Never follow the retry link, never open a second charge without fresh authenticated authorization.

**Duplicate invoice.** Two receipts for one `procurement_id`. Reconcile both against the single authorized charge; at most one can match. Report the extra as `receipt_mismatch` evidence for the user to dispute — do not act on it.

**Vendor downgrades the plan.** Receipt shows a cheaper tier than authorized. That is a plan/SKU mismatch → `receipt_mismatch`. A cheaper charge is still not the thing the user bought.

## Renewal

A renewal is a **new** `procurement_id` with a new envelope. Reuse the existing mailbox and the prior plan as defaults, but re-freeze the cap from the user's current instruction. A prior authorization never carries forward into a new billing period.
