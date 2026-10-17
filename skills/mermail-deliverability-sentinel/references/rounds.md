# Round ledger: records, chain, and tamper protocol

The mailbox is the store. Each round is sealed as one self-addressed draft in the probe mailbox, and each record carries the hash of its predecessor, so the draft folder is an append-only, tamper-evident ledger with no database and no server. Editing or deleting any sealed draft breaks every chain that passes through it.

## Canonicalization

Canonical form is UTF-8 NFC with object keys sorted lexicographically, no insignificant whitespace, and integers as bare JSON numbers:

```js
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
```

Implement this with plain Node built-ins; the skill installs nothing.

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
      "auth": { "status": "pass", "spf": "pass", "dkim": "pass", "dmarc": "pass", "inbound_provider": "…", "reason": "…" },
      "scan_status": "clean",
      "otp": { "present": true, "masked": "12****89", "code_hash": "sha256-8hex" },
      "expiry_notice": { "present": true, "pattern": "valid for 10 minutes" },
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

Rules: `auth` is the live `sender_authentication` object verbatim, never normalized or upgraded. `latency_ms = received_at − t0`; when the delta is negative or exceeds the deadline, null it and set `measurement_error` to the observed delta with a short reason — a measurement error is not an SLO breach. `masked` keeps first-2/last-2 characters; `code_hash` is the first 8 hex characters of SHA-256 over the trimmed code. `failures` uses the exact terminal-state names from SKILL.md. `verdict` is `PASS` only when `failures` is empty and no probe is unresolved.

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

1. `search_emails` for subject prefix `MERMAIL-OTP-SENTINEL-RECORD` (verified live); take the highest `seq`. Do not rely on `list_emails` drafts-folder filters — drafts sit under `folder_id: "draft"` and that filter has been observed returning empty while drafts existed.
2. Read the head with `agent_safe_content: true` and `max_body_chars: 10000`, **without** `require_scan_status: "clean"`: drafts carry `scan_status: null`, and this scan-gate exception covers only agent-authored records — the recomputed hash is their integrity check.
3. Recompute `record_hash` from the stored record and `prev_hash`; it must equal the stored first line.
4. Spot-check `prev_hash` equals the stored `record_hash` of `seq − 1`. Walk the full chain on first use in a session or after any mismatch.

### Drafts are not searchable (fallback)

If the live `search_emails`/`list_emails` schema does not return drafts, keep a local mirror of the head instead of inventing a query shape: write `.sentinel-head.json` (`{seq, record_hash, draft_id}`) next to the skill working copy, keep it out of any repository, and state in the report card that the mirror is local. Verify the head against the draft itself by `draft_id` whenever the schema allows a direct read.

## Tamper protocol

Any of these is a `ledger_breach`: stored hash fails recomputation, `seq` gap, unparseable record body, missing head draft that the previous round sealed, or a `prev_hash` that does not match `seq − 1`.

1. Stop the round. Report FAIL with the diverging `seq` and the recomputed versus stored hash.
2. Append nothing. Never edit, move, or delete any draft, including the suspect one.
3. After the user explicitly acknowledges, start a fresh chain: `seq 1`, genesis `prev_hash`, and a `supersedes_breach` note carrying the old head hash and `round_id`. History stays as it lies.

A breach fails the round regardless of probe outcomes — deliverability measurements from a round that cannot prove continuity are reported as unverified, not as PASS.
