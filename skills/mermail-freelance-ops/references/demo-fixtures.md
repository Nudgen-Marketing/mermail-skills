# Demo fixture and expected outcome

Use a dedicated Mermail test mailbox. These are fixture subjects and sample snippets for preparing a safe recording; do not put real credentials, payment links, or private client data on screen.

| Subject | Category | Money signal | Expected action |
|---|---|---|---|
| `Deposit for October landing page` | `PAYMENT_ACTION` | `USD 1,200 deposit`, due Friday | Star anchor; draft a confirmation question; add a non-transactional wallet note |
| `Small scope change before launch` | `SCOPE_CHANGE` | “Can you also add analytics?”; price absent | Star anchor; draft a reply asking for the acceptance criteria and whether to quote the change |
| `Can we meet Tuesday?` | `SCHEDULING` | None | Put in Next; no wallet note |
| `Weekly product newsletter` | `FYI` | None | Put in Watch; no write |

## Expected final summary

```text
Mailbox: freelance-demo@… (public_id: …)
Read: Inbox, last 14 days, 4 candidates; no next page.

NOW
- P1 PAYMENT_ACTION — Deposit for October landing page — money watch — starred
- P1 SCOPE_CHANGE — Small scope change before launch — money watch — starred

NEXT
- P2 SCHEDULING — Can we meet Tuesday? — no draft requested for this demo

WATCH
- FYI — Weekly product newsletter

Drafts: 2 saved for review; 0 sent.
WALLET NOTE (not executed): USD 1,200 deposit is mentioned; payment status still needs confirmation.
```

The ids shown in a real run must be returned by Mermail. Do not fabricate fixture ids in the recording.
