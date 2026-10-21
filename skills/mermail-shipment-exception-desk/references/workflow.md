# Shipment exception workflow

## Case states

| State | Meaning | Default next step |
| --- | --- | --- |
| `monitoring` | A delay or transit update exists, but no immediate action is supported | Record next review point |
| `action_needed` | A bounded, non-financial fact or document is missing from the owner | Draft a minimal evidence request |
| `carrier_contact` | The carrier needs a question, trace request, or contradiction summary | Save a carrier inquiry draft |
| `customer_update` | A customer or recipient needs a factual status update | Save a same-thread update draft |
| `claim_candidate` | Loss or damage evidence may justify a claim, but eligibility is not established | Prepare an evidence checklist; do not promise payment |
| `resolved` | Independent evidence supports closure and no exception remains | Offer label/folder update; retain messages |
| `uncertain` | Sources conflict, identity/order binding is weak, or a write outcome is unknown | Preserve claims and request the smallest resolving evidence |

## Timeline rules

Sort by the event time stated in each source while retaining message received time. Never overwrite a prior event. A later email may supersede a carrier estimate, but it does not erase the earlier statement. Record source message IDs so another builder can reproduce the classification from the same thread.

Use `reported` for email assertions, `user_confirmed` for facts the authenticated user supplies, and `independently_verified` only for a source the user has authorized and the agent actually checked. Mermail inbox access alone supplies reported evidence.

## Draft patterns

Carrier inquiry: state the user-confirmed case key, list the specific contradiction or missing scan, ask one bounded question, and omit unnecessary personal data.

Customer update: state what is known, what remains reported or uncertain, the next authorized action, and when another update is expected. Do not promise a refund, delivery date, or claim outcome.

Evidence request: ask only for the missing item needed for the next decision, such as a safe photo description or user-confirmed recipient status. Do not ask for passwords, verification codes, full payment-card data, or identity documents through ordinary email.

Internal escalation: summarize the case key, timeline, contradiction, privacy-sensitive material that was withheld, and the decision needed. Keep original attachments and personal data out of the forward unless the user authorizes each item.
