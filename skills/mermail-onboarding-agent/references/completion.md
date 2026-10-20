# Account outcomes and completion records

## Existing account or blocked registration

Use only the owner-selected service, account, mailbox and approved signup attempt. Check the target service permits agent-assisted registration; stop when prohibited. CAPTCHA, terms acceptance and identity assertions stay with the user whenever required by the service or host. Do not bypass them or manufacture identity claims.

If the service reports an existing account, return `blocked` with `account_exists`; do not trigger password recovery, reset credentials, select a different identity, or repeat signup. An existing authenticated session is not evidence this attempt created the account. A later explicit recovery/login request is a separate scoped workflow. On uncertain submission, reconcile authoritative state once without resubmitting and report `uncertain` if still unresolved.

## Newsletter or waitlist without a verification challenge

Before submission, freeze the requested outcome: subscribed to a named publication, joined a named waitlist, or activated a specific account/plan. A waitlist enrollment is not product access. Preview the exact signup fields, marketing consent, disclosures and plan; obtain exact approval before submission. Free enrollment does not authorize a trial, paid plan, recurring payment or card entry.

If the service-side result for the exact submitted account explicitly confirms that frozen outcome and says no additional verification is required, report that outcome as `completed` without manufacturing a code or requesting a resend. Do not enter the artifact-extraction path. A welcome email alone, generic success page, logged-in session for another account, or ambiguous result is not sufficient: return `pending`/`uncertain`, or a user-controlled handoff. If verification is required after all, use the original complete pre-trigger baseline and the full correlation gates; absence of a code never waives them.

## Non-secret receipt and optional archival

After authoritative completion, show a compact receipt: service and approved origin, exact account identifier and mailbox public ID, login method (password, SSO or passwordless), plan/enrollment outcome, observation timestamp and source, remaining actions. Never include credentials, OTPs, token URLs, raw bodies or payment proofs. Distinguish account verified from API credential created, stored or tested; none implies the others.

The default receipt is returned in the current conversation, not persisted elsewhere. Saving it in a user-selected destination requires permission for that exact destination and content; if no safe supported capability exists, leave it unsaved. Store only non-secret evidence pointers. Do not archive verification email containing a live token into another system. Moving the original message inside Mermail is optional organization, not evidence of account completion: ask for the exact message/folder move, resolve the folder through `mermail-manage-inbox`, recheck mailbox/message binding, and reconcile an uncertain write before any retry. Never delete as cleanup or invent a folder ID. Secrets belong only in a separately authorized supported credential store, not this receipt.

## Paid API activation boundary

For a separately requested API credential, read [credentials.md](credentials.md). It defines the secure provider/store/use handoff and partial-completion states, not a credential backend.

For the complete named signup-and-optional-pay sequence, including free-mode wallet isolation and return-state binding, read [signup-payment.md](signup-payment.md).

An HTTP 402 or trial-deposit challenge does not authorize payment. Return a separate owner-review handoff to the wallet/x402 owner with service/resource, account and unresolved activation step; never invent aliases, payment tools, default spending permission or API credentials. Exact financial terms and eligible OAuth are required there. Proof creation or signing is not merchant settlement; return to onboarding only after authoritative merchant/account state confirms activation. Keep `account verified`, `payment pending`, `service activated`, `credential created`, and `credential stored/tested` separate. If any part is unavailable, report partial completion rather than promising autonomous paid onboarding.

## Contribution provenance

These bounded cases preserve the existing-account stop from [#198](https://github.com/Nudgen-Marketing/mermail-skills/pull/198), no-challenge subscription/waitlist outcome from [#177](https://github.com/Nudgen-Marketing/mermail-skills/pull/177), and completion receipt/archival intent from [#91](https://github.com/Nudgen-Marketing/mermail-skills/pull/91). [#134](https://github.com/Nudgen-Marketing/mermail-skills/pull/134) motivates the separate paid-activation handoff; this does not implement or certify its full paid-service workflow. Their authors retain credit; this consolidation does not preserve unsafe shortcuts or duplicate tool ownership.
