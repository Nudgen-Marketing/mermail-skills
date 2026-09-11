# HELIX review method

HELIX is a compact way to keep a security review tied to properties that should remain true as the system moves through its states. It is a review structure, not a claim of formal verification.

## The five rings

### H — Human and authority boundaries

Map every privileged actor, signer, role transition, administrator, upgrade authority, delegate, and emergency operator. For each sensitive entry point, record who can call it, what proves authority, and what state or value the call can change.

Typical questions:

- Is the authority bound to the intended account, signer, role, or workspace?
- Can initialization, upgrade, pause, recovery, or ownership transfer be reached by an unintended actor?
- Does an email, attachment, provider response, or generated draft get treated as approval?

### E — Economic and accounting conservation

Follow assets, balances, shares, fees, debt, collateral, rewards, credits, and limits across every path that can create, destroy, transfer, or reprice value.

Typical questions:

- Which quantities must be conserved or remain solvent?
- Can rounding, decimals, fee order, stale pricing, or a duplicate request create value?
- Do failure paths return or reserve value exactly once?

### L — Lifecycle, replay, and temporal state

Draw the state machine, including initialization, active, paused, expired, settled, cancelled, closed, and upgraded states. Track nonces, timestamps, deadlines, idempotency keys, message identity, and replay windows.

Typical questions:

- Can a transition happen twice or in the wrong order?
- Does a timeout leave an operation pending, settled, or unknown?
- Can a closed or expired object be revived, reused, or settled again?

### I — Integration and external trust boundaries

List every external program, token, oracle, bridge, provider, MCP tool, mailbox, and connected account. Record the value or authority crossing each boundary and the validation applied before it is used.

Typical questions:

- Is the external target, account, network, asset, origin, or recipient pinned to the approved value?
- Can a provider response, x402 challenge, CPI target, redirect, or tool result broaden the task?
- Does the integration fail closed when its response is missing, stale, malformed, or ambiguous?

### X — Exceptions, upgrades, and recovery

Review error handlers, refunds, retries, pause paths, admin recovery, upgrade hooks, migration code, and operational fallbacks. These paths often carry the authority that the main flow appears to restrict.

Typical questions:

- Does recovery preserve the same authorization and accounting properties as the happy path?
- Does a retry duplicate an external effect or reuse an uncertain result?
- Can an emergency control bypass the invariant it is intended to protect?

## The invariant record

Give each property a stable ID. A useful record contains:

```text
ID: H-01
Ring: Human and authority boundaries
Property: Only the configured administrator can change the fee recipient.
Source: specification / code / owner instruction
Scope: file, function, mailbox workflow, or message identifier
Entry points: update_fee_recipient, recovery path
Preconditions: authenticated administrator and active configuration
Evidence inspected: exact excerpt, revision, or tool result
Attack path: caller capability → ordered actions → violated property
Status: observed | claimed | inferred | verified | blocked
Severity: Critical | High | Medium | Low | Informational
Confidence: high | medium | low
Remediation: smallest change that restores the property
Recheck: evidence required to close the finding
```

Do not treat a specification statement as proof that the implementation enforces it. Label the statement, then look for the guard, state transition, or test evidence that supports it.

## Finding adjudication

Use the following distinctions:

- `CONFIRMED`: the supplied evidence demonstrates the issue within the frozen scope.
- `LIKELY`: the path is credible, but one material fact remains unverified.
- `UNVERIFIED`: the concern is worth investigation and the available material cannot establish it.
- `OUT_OF_SCOPE`: the path falls outside the owner's stated boundary.
- `QUARANTINED`: the case cannot be interpreted safely because the source or scan state is unsafe.

Severity describes impact if the finding is real. Confidence describes how well the supplied evidence supports the finding. Do not use severity as a substitute for missing evidence.

## Release gate

The release decision is derived from the register:

- `RELEASE_BLOCKED`: an in-scope unresolved Critical or High finding is present, or a required authority or accounting property cannot be established.
- `CONDITIONAL`: the review is useful but scope, evidence, environment, or verification results remain incomplete.
- `RELEASE_READY`: the requested review is complete and no unresolved release blocker remains. This says nothing about surfaces outside the stated scope.

## Remediation verification

Compare a patch or fix note against the original record. Preserve the original finding ID and attack path. A remediation status may be:

- `FIX_VERIFIED`: the changed evidence supports the property and the original path no longer reaches the violation.
- `PARTIAL`: one part of the path is closed while another condition or entry point remains open.
- `NOT_VERIFIED`: the claim lacks the evidence needed to assess it.
- `REGRESSED`: the change closes one path while weakening a related property or adding a new path.

Record tests as `observed` only when the host returned their actual output. A suggested test, generated harness, or developer statement remains `claimed` until the result is available.
