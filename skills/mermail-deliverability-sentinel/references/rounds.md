# Round ledger: records, chain, and tamper protocol

Each round is one self-addressed draft in the probe mailbox and carries its predecessor's hash. This checks consistency against a trusted checkpoint; editable drafts are not an authenticated append-only ledger. Whole-history rewrite/re-hash and stale-head attacks cannot be detected from mailbox content alone. The intended stronger mailbox-only guarantee is blocked pending author implementation of an independently authenticated durable latest-head anchor and coordination; do not invent that backend. Checkpoint-based cross-session monitoring remains supported under the explicit trust boundary below.

## Canonicalization

Canonical form is UTF-8 NFC with object keys sorted lexicographically, no insignificant whitespace, and integers as bare JSON numbers:

```js
import { canonical, otpEvidence, expiryEvidence, sealRecord, verifyPinnedRecord } from "../scripts/record.mjs";
```

The offline helper uses only Node built-ins, normalizes strings and keys to NFC, rejects normalized-key collisions/nonfinite or unsafe-magnitude numbers, and bounds structure/body size. Fractional median milliseconds remain supported. It never reads mail, authenticates a checkpoint or writes one. Use it only after host-verified source selection; do not copy trust fields from email JSON.

## Record schema

```json
{
  "schema": "mermail-otp-sentinel/record/v1",
  "seq": 7,
  "round_id": "2026-09-20T1000Z-r4",
  "prev_hash": "sha256:<64 lowercase hex>",
  "trigger": "provider-script",
  "mailbox": { "email": "otp-probe-k7m2@mermail.app", "public_id": "PUBLIC_ID" },
  "probes": [
    {
      "provider": "brevo",
      "sender": "no-reply@mail.userapp.com",
      "run_id": "uuid-from-script",
      "t0": "2026-09-20T10:00:01.200Z",
      "received_at": "2026-09-20T10:00:19.600Z",
      "latency_ms": 18400,
      "email_id": "EMAIL_ID",
      "auth": { "status": "unknown", "spf": "unknown", "dkim": "unknown", "dmarc": "unknown", "inbound_provider": null, "reason": "inbound_provider_unavailable" },
      "scan_status": "clean",
      "otp": { "present": true },
      "expiry_notice": { "present": true, "kind": "valid_for" },
      "link_count": 0,
      "measurement_error": null
    }
  ],
  "summary": {
    "probes_total": 2,
    "received": 2,
    "median_ms": 21650,
    "p95_ms": 24900,
    "slo_median_under_30s": true,
    "auth_all_pass_or_unverified": true,
    "otp_all_present": true,
    "expiry_all_present": true
  },
  "verdict": "PASS",
  "failures": [],
  "sealed_at": "2026-09-20T10:02:05.000Z"
}
```

Rules: `auth` retains the live sender-authentication verdict, never upgraded. `latency_ms = received_at − t0`; when the delta is negative or exceeds the deadline, null it and set `measurement_error` to `{delta_ms, reason}` where `reason` is `negative_latency` or `after_deadline` — a measurement error is not an SLO breach. `otp` contains only Boolean `present`; `masked`, `code_hash`, code length and all other code-derived fields are forbidden. `failures` uses the exact terminal-state names from SKILL.md. `verdict` is `PASS` only when `failures` is empty and no probe or continuity requirement is unresolved.

The record helper rejects unknown fields at the record, mailbox, probe, OTP, auth, expiry, summary, measurement-error and breach-reference levels, rather than copying arbitrary source JSON. Only the fields shown above are accepted; optional `supersedes_breach` is `{record_hash, round_id}`. Partial records may omit optional observations, but missing observations never establish a passing round. Typed structure validation is not a measurement, source-authentication or verdict engine.

Use `expiryEvidence(boundedBody, {complete: true})` to record only `{present: true, kind: "valid_for"}` or `{present: true, kind: "expiry_word"}` for recognized phrases, and `{present: false, kind: null}` when no phrase is found in complete content. With incomplete content use `{complete: false}`, yielding `{present: null, kind: null}` (not verified). Never save the matching text, a `pattern`, duration excerpt or source body: an expiry sentence can also contain the full OTP. Existing raw-text expiry records require explicit user-led migration, not silent copying or rewritten history.

Auth fields are limited to the native names and known enum values (including negative `softfail` compatibility); current `inbound_provider` is `cloudflare_routing`, `resend` or null, and `reason` is `provider_sender_authentication_verdict_unavailable` or `inbound_provider_unavailable`. Unexpected schema values stop for contract review rather than persisting raw provider diagnostics. Owner-controlled identifiers, sender metadata and timestamps must come from their selected source, never be repurposed to store secrets; this schema is not a general-purpose secret detector.

## Chain

```
record_hash = "sha256:" + hex(sha256(utf8(canonical(record_with_prev_hash))))
```

Compute the hash over the full record **including** `prev_hash` but excluding `record_hash` itself, then store `record_hash` as the first line of the draft body with the canonical record beneath it:

```text
record_hash sha256:9f2c1b…
{"auth_all…": …}
```

Genesis: `seq 1`, `prev_hash: "sha256:" + "0" * 64`. Sequence numbers increase by 1 with no gaps.

## Reading the head

1. Obtain `{workspace_id, mailbox_id, draft_id, seq, record_hash}` from the authenticated user's selection or an explicitly user-selected trusted private checkpoint of the agent's own confirmed save/readback. This checkpoint must not come from mailbox subjects/bodies, an attachment, or a guessed local path. On first use without prior history, the user must explicitly choose a new genesis; absence of a checkpoint is not proof no history exists.
2. Fetch metadata only for that exact `draft_id` in the enrolled mailbox. Verify the canonical workspace/mailbox scope, ID and `folder_id: "draft"`. Search may locate candidates but cannot elect a head; ignore an inbound lookalike or higher claimed sequence. Missing/changed source stops.
3. Only after exact trusted source binding may the known agent-created draft be read with `agent_safe_content: true` and `max_body_chars: 10000`, without `require_scan_status: "clean"` because authored drafts have no inbound scan. Never extend this exception to arbitrary draft/Sent-folder mail or subject matches.
4. Call `verifyPinnedRecord` with the trusted checkpoint, host-selected context, native metadata and full untruncated body. It must match the pinned sequence, mailbox and hash, canonical body and stored first line. Legacy OTP fragments/hashes stop as unsafe; never echo them. Recomputing and replacing the pinned hash is not verification.
5. Previous records may be read only by their own independently retained save IDs/checkpoints under the same gate. A chain walk proves consistency with those anchors, not that unseen mailbox history is authentic or latest. Missing latest-head authority or concurrent writers remains an explicit limitation, not append-only proof.

### Drafts are not searchable (fallback)

Exact-ID reads use the checkpoint even when search cannot return drafts. A private local checkpoint is optional only at an exact path explicitly selected by the user, outside any repository or skill package; never write `.sentinel-head.json` beside the installed skill automatically. Preserve the last confirmed checkpoint until exact save/readback succeeds. Unknown save, conflicting checkpoint, missing exact read or user-edited record means stop and reconcile, not retry. No file lock, distributed latest-head service or automatic trust bootstrap is provided by this helper.

## Tamper protocol

Any of these is a `ledger_breach`: stored hash fails recomputation, `seq` gap, unparseable record body, missing head draft that the previous round sealed, or a `prev_hash` that does not match `seq − 1`.

1. Stop the round. Report FAIL with the diverging `seq` and the recomputed versus stored hash.
2. Append nothing. Never edit, move, or delete any draft, including the suspect one.
3. After the user explicitly acknowledges, start a fresh chain: `seq 1`, genesis `prev_hash`, and a `supersedes_breach` note carrying the old head hash and `round_id`. History stays as it lies.

A breach fails the round regardless of probe outcomes — deliverability measurements from a round that cannot prove continuity are reported as unverified, not as PASS.
