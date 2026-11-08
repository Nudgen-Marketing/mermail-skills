# Customer evidence method

## Units of evidence

Prefer an independently verified customer account as the unit of support. This requires an owner-provided account ID or an owner-verified mapping from a thread to an account. When that mapping is absent, report distinct threads and set customer independence to `unknown`.

Message count measures activity. It does not measure customers, demand, prevalence, revenue, or willingness to pay.

## Evidence entry

Record these fields for each distinct claim or outcome:

- `problem_or_outcome`
- `evidence_kind`: `customer_statement`, `observed_behavior`, `owner_record`, or `analyst_inference`
- source `email_id`, `thread_id`, and observation time
- owner-supplied account key, or `independence_unknown`
- concise statement or observed event
- user impact and relevant context
- counterevidence or successful workaround
- uncertainty and missing context
- evidence band

Do not merge an inference into the source statement. Keep direct evidence and interpretation in separate fields.

## Evidence bands

Use these bands without adding a numerical score:

- **strong** — at least three independently verified customer accounts describe the same problem or outcome, the evidence is concrete or reproducible, and there is no unresolved contradiction that changes the decision.
- **moderate** — two independently verified accounts support the same concrete point, or one reproducible observation is corroborated by a relevant owner record.
- **weak** — one source, uncertain independence, vague language, indirect evidence, or material missing context.
- **insufficient** — the source cannot safely support the claim, required context is missing, or account independence is unknown for a claim that depends on customer count.

Without an owner-verified account mapping, cap a prevalence or demand claim at **weak**. A single reproducible defect may support the separate claim that the defect exists at **moderate**; its prevalence remains unknown.

## Decision synthesis

Group evidence by the customer's underlying job, problem, and desired outcome rather than matching exact words. For each group:

1. State the narrowest claim supported by the sources.
2. Separate verified account count, distinct thread count, and message count.
3. Include counterexamples, successful workarounds, and segment differences.
4. State what the evidence cannot establish.
5. Propose the smallest next test that could change the decision.

Do not recommend building a feature only because it appeared often. Compare the problem's impact, recurrence across independent accounts, existing alternatives, and the cost of the next reversible test.

## Neutral follow-up questions

Ask one question at a time and avoid leading wording. Useful forms include:

- "What were you trying to finish when this happened?"
- "What did you do next?"
- "How often has this happened in the last month?"
- "What do you use instead today?"
- "What would make this worth changing for you?"

Do not mention another customer, promise delivery, imply a price, request secrets, or ask for payment information.
