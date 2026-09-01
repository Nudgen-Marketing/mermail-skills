# Eval briefing workflows

## Mailbox

1. `list_mailboxes`. Prefer a mailbox whose `name` or address contains `eval`, `bench`, or a name the user gave.
2. If several are plausible, ask. Do not guess.
3. If none exist and the user authorizes provisioning, `create_mailbox` with `email` + `name`. 10 API credits.
4. Skip `agentInbox.mode: "verification"`. This is a conversation mailbox, not a signup trap.

## Parse

Extract two cards. Missing required fields → `needs_hardware_card`, do not brief.

**Hardware card (required: ram_gib, cpu_cores)**

- ram_gib, cpu_cores, swap (yes/no/unknown), gpu (none/name), disk_ceiling_mib_s (optional)

**Model card (required: model_name, runtime)**

- model_name, quant, params_active / params_total, runtime (llama.cpp, vLLM, …)

**Success criteria (optional, do not invent)**

- min_tok_s, max_rss_mib, interactive (yes/no)

## Measure

Pick one method and record it in the briefing.

### local-harness

Run only what the user authorized on a machine they control. Capture:

- command line
- log path
- tok/s, peak RSS MiB, major faults / token if available

### cited-prior-bench

The user names a public repo + hardware line. Example protocol (do not treat as universal numbers):

- https://github.com/dhishwasher/moe-offload-bench
- Hardware line must match the parsed hardware card.
- Quote table rows with file paths (`README.md`, `RESULTS.md`, `results/...`).

### paid-x402

Only after the authenticated user selects origin + maximum spend. Freeze an outcome contract (model, quant, n tokens, what tok/s means), then follow `mermail-x402-agent`. Proof creation is not merchant settlement.

## Briefing schema

```text
Verdict: go | no-go | go-with-offload
Mailbox: <email> (<public_id>)
Hardware: <cores> cores, <ram_gib> GiB RAM, swap=<yes|no|unknown>, gpu=<none|name>
Model: <name> <quant> via <runtime>
Method: local-harness | cited-prior-bench | paid-x402
Measurements:
  tok/s: <n or unmeasured>   source: <log|csv|tool>
  peak RSS MiB: <n or unmeasured>
  I/O MB/s: <n or unmeasured>
  notes: <one paragraph, no invented figures>
Caveats: <what would change the verdict>
```

## Reply

1. `save_draft` while the user edits numbers or tone.
2. Preview To/Cc/Bcc/from/subject/body. Wait.
3. `reply_to_email` (preferred for inbound) or `send_email` with `body.from` = mailbox email.
4. Optional: label `eval-go` / `eval-nogo` / `eval-needs-hw`.
5. One idempotency key per approved send. Do not auto-retry `email_send_rate_limit_exceeded`; surface `Retry-After`.
