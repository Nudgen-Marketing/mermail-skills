# Discussion triage fixtures — mermail-base-usdc-invoice

Public-thread **golden fixtures** for invoice follow-up triage. Alias / fixture-named companion to [discussion-triage.md](discussion-triage.md) (same labels; filename includes `fixtures` for ECC Reference Set matching).

## Fixture labels

| Class | When | Agent action |
| --- | --- | --- |
| **informational** | Payer asks how to open the EIP-681 / MetaMask link, which chain (Base), or what the memo means — no dispute of amount/address | Answer from [workflows.md](workflows.md) / [examples.md](examples.md); do not re-send unless asked |
| **answered** | Payer confirms they paid, or prior reply already resolved the question | Acknowledge; optionally point to Basescan Transfer check; do **not** invent a new invoice |
| **no-response** | No reply after send + reasonable wait; or auto-reply / bounce only | Do not escalate amount; offer one polite nudge draft for user approval, or mark thread idle |

## Golden fixtures (public-thread style)

### FIX-DT-1 — informational

- Thread: invoice for 12 USDC to `0xbAd4…019b` already sent.
- Inbound: “Which network is this on / how do I open the link on mobile?”
- Classify: **informational**.
- Reply shape: Base (8453), paste EIP-681 or MetaMask deeplink from the original preview; no new amount.

### FIX-DT-2 — answered

- Inbound: “Sent 12 USDC, here’s the tx hash …”
- Classify: **answered**.
- Reply shape: thanks + remind settlement is on-chain; optional public Basescan link. Do not claim receipt without Transfer verification.

### FIX-DT-3 — no-response

- 72h silence after invoice send (or only “out of office”).
- Classify: **no-response**.
- Action: draft one short nudge for **user approval**; never auto-bump amount or change payee.

## Anti-patterns

- Reclassifying a payee-address dispute as informational and “fixing” the address from inbound mail.
- Treating a payment claim as **answered** without any on-chain check when the user asked to verify.
- Spamming multiple nudges on **no-response** without explicit user approval each time.

See also: [discussion-triage.md](discussion-triage.md) (narrative twin), [analyzer-fixtures.md](analyzer-fixtures.md).
