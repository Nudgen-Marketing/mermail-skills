# Workflows

## Incident triage

1. Freeze the user-selected integration and incident window.
2. Resolve one mailbox, then search metadata for provider, endpoint label, request/delivery ID, or error family.
3. Read only selected clean messages.
4. Build events with source ID, observed time, symptom, identifiers, and evidence level.
5. Group matching request IDs and retry chains; keep contradictory events visible.
6. Produce current state, impact, strongest hypotheses, and missing evidence.
7. Save the incident update as a draft by default.

## Recovery verification

A provider or customer message claiming recovery changes the state to `recovered_unverified`. Move to `resolved_verified` only when authoritative evidence corroborates recovery for the affected integration and environment.

## Customer/provider update

Use a compact structure: incident window, observed impact, what is known, what remains uncertain, current mitigation or next evidence request, and next update point. Do not include internal secrets or unrelated customer evidence.

If delivery is requested, show exact From/To/Cc/Bcc and body, obtain fresh approval, then perform one send or reply. Preserve the returned message identifier and report tool acceptance separately from recipient receipt.