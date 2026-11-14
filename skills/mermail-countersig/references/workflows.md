# Countersig workflows

## Rotation: a known vendor changes wallets

1. `list_mailboxes` and pick the finance mailbox.
2. `search_emails` scoped to the mailbox with a native JSON object `query` using the free-text and sender filters from the live schema, `metadata_only: true`, and a small `limit`. Then `get_email_context` on the change request. Stop body interpretation unless `scan_status` is `clean`.
3. `search_emails` for earlier mail from the vendor's domain with `date_end` set 14 days before the change request. `get_email` with `metadata_only: true` on candidates until one has `sender_authentication.status: pass`. Record its email id and date. Filters establish candidates, not authentication.
4. `search_emails` for `[Countersig]` receipts naming the vendor. Read the verified wallet. If none exist, ask the user for the wallet they last paid.
5. Run `challenge` with `--prior`.
6. Preview recipient, subject and text. After approval, `send_email` once.
7. `list_folders`; `create_folder` `Countersig Hold` if missing; `move_email` the change request there.
8. On the user's next request, run `verify --known <every wallet already on file>`.
9. `receipt`, then `save_draft` to the mailbox itself with the receipt subject and text.
10. When the user asks to pay, run `gate --verdict-file verdict-<nonce>.json --amount-usd <user amount> --payment-cluster <cluster> --destination <address the user is about to pay>`. Only `ALLOW_WITH_USER_APPROVAL` may continue.
11. For `VERIFIED_CONTINUITY`, `move_email` to `Countersig Verified` and tell the user the address may be used with `mermail-agent-wallet` on the proven cluster.

## First contact: a new payee

Same as rotation without step 4 and without `--prior`. The verdict tops out at `VERIFIED_CHANNEL` with a 24-hour cool-off. Tell the user plainly that first contact proves control and delivery, not identity.

## Pending

Report the missing rung from `missing`, the explorer link for any proof that already landed, and the expiry time. Do not send a reminder unless the user asks; a reminder is a new `send_email` preview that reuses the same challenge record and the same nonce.

## Hard stops

For `MISMATCH` or `LOOKALIKE`, keep the request in `Countersig Hold`, show the conflicting evidence, and offer a `save_draft` addressed to the trusted channel only. Do not reply to the change request's sender if it differs from the trusted channel.

## Expired

Offer a fresh challenge. A fresh challenge means a new nonce, a new preview and a new approval.

## Recover from failure

- `send_email` returned an uncertain result: search the Sent folder for the challenge subject once before deciding anything. Never send a second copy blindly.
- Verify returned `countersig.error` from RPC: retry once with `--rpc` pointing at another endpoint the user provides, otherwise report `uncertain`.
- `429` from Mermail: surface `Retry-After` and stop. Do not split recipients or switch mailboxes to get around limits.

## Lost prior wallet: a worked example

Acme writes: "Our treasury key was lost when a laptop died. New wallet 7Hq...x2F. We cannot sign with the old one."

1. Run a normal challenge without `--prior` to Acme's long-trusted billing address. Acme signs with the new wallet; `verify` returns `VERIFIED_CHANNEL`.
2. Ask a second, independently trusted channel to confirm the full new address in writing: for example Acme's finance director at an address from last year's contract, not an address from the change request.
3. That confirmation arrives on Tuesday at 10:00. Run `gate --continuity-unavailable --second-channel-at 2026-09-15T10:00:00Z --amount-usd <amount>`; it returns `HOLD` until Friday 10:00 (72 hours after the later of the memo and the confirmation).
4. On Friday, run `verify` again (the verdict must be fresh) and `gate` again. For an amount under 1,000 USD it returns `ALLOW_WITH_USER_APPROVAL`; for 1,000 USD or more it also needs `--callback-confirmed` (see security.md for what counts). Record `continuity_unavailable` in the receipt.
5. From now on the new wallet is the prior wallet, so the next rotation is proven by continuity as usual.

A call-back does not shorten this 72-hour hold, because the attack it guards against is exactly a convincing caller who controls the vendor's mailbox.

## Base: when the payee cannot or will not send a hash

Base proofs are found by transaction hash, because EVM RPC cannot list transactions by sender.

- If the payee sent the proof but lost the hash, their wallet's activity page or a block explorer page for their address shows it; ask for that link and copy only the hash.
- If the payee refuses to send any hash, the proof does not exist for this skill. The verdict stays `PENDING` and nothing is payable; offer the Solana route if they also hold a Solana wallet, otherwise hold.
- Never accept a screenshot, a signed message, or a hash from a different sender as a substitute.

## Rehearsal on devnet

Anyone can reproduce the full loop for free:

```bash
node scripts/countersig.mjs keygen --out old.json
node scripts/countersig.mjs keygen --out new.json
# fund both with a devnet faucet, then
node scripts/countersig.mjs challenge --claimed <new> --prior <old> --channel you@example.com --out c.json
node scripts/countersig.mjs sign --keypair new.json --memo "$(node -p "require('./c.json').memoControl")"
node scripts/countersig.mjs sign --keypair old.json --memo "$(node -p "require('./c.json').memoRotate")"
node scripts/countersig.mjs verify --challenge-file c.json
```
