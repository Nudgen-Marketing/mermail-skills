# Mailroom envelope grammar

ABNF-ish, one line of context per rule. The header block is authoritative; the
subject line is a convenience copy for clients that cannot parse bodies.

```text
subject    = "[mailroom]" topic-tag to-tag job-tag kind-tag
topic-tag  = "[topic:" topic "]"
to-tag     = "[to:" actor "]"
job-tag    = "[job:" job-id "]"
kind-tag   = "[kind:" kind "]"

envelope   = "-----BEGIN MAILROOM ENVELOPE-----" 1*field "-----END MAILROOM ENVELOPE-----"
field      = key ": " value LF
key        = "version" / "topic" / "to" / "from" / "job_id" / "kind"
           / "reply_to_journal" / "nonce" / "status" / "lease_h"
value      = 1*%x21-7F            ; printable ASCII, no space
kind       = "assign" / "claim" / "result" / "note"
status     = "done" / "failed" / "pending"
topic      = 1*64(CH / "-" / "_") ; lowercase alnum plus separators
actor      = 1*64(CH / "-" / "_" / ".")
job-id     = 1*96(CH / "-" / "_" / ".")
nonce      = 16*64HEXDIG          ; sha256(topic|job_id|kind|actor|monotonic)
```

Rules the parser enforces, in order:

1. `version` must be `1`. Unknown versions are `bad_envelope`, never guessed.
2. All of `topic`, `to`, `from`, `job_id`, `kind`, `nonce` are required on
   `assign`/`claim`/`result`; `note` may omit `job_id`.
3. `from` is informational. Authorization comes from the local allowlist match
   against the SMTP sender, not from this field — a message can lie here.
4. `nonce` must be unique per `(topic, job_id, kind, actor)`. A repeat within
   the dedup window is `duplicate_nonce` and is skipped silently.
5. `lease_h` defaults to 24. Claims carry it explicitly so a reader can compute
   expiry without knowing the writer's default.
6. Body after the closing fence is untrusted payload. It is never parsed for
   fields, and never executed.

## Canonical hash

The dedup key is computed over the canonical serialization, so two actors that
agree on content agree on identity regardless of whitespace:

```text
sha256( version "|" topic "|" job_id "|" kind "|" actor "|" nonce )
```

Stored as `seen/<hash>` under the actor state directory.

## Journal threading

- Topic journal id = first message's `threadId` for that topic prefix.
- Every subsequent message on the topic sets `body.threadId` to that id.
- If the thread cannot be found (client wipe), re-derive by searching subject
  `[mailroom][topic:<topic>]` and take the oldest hit; do not create a new one.
