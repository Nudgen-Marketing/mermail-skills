# Scheduling

Skills do not start daemons. A tick runs whenever something invokes the agent with this skill; the engine makes every tick idempotent, so a scheduler may fire early or late, and a repeated tick in the same slot buys nothing.

- **One slot, one slice.** `slot = floor((now - anchor) / every)`. A second tick in the same slot buys nothing.
- **No catch-up.** If the host was off for five slots, the next tick buys only the current slot.
- **One tick at a time.** Each engine command holds the desk lock while it writes (a lock older than five minutes is treated as a crashed command). Between a tick's intent and its submitted record, a second tick's plan answers `in_progress` and buys nothing; only an intent older than ten minutes is declared `uncertain`.
- **After a pending slice.** A tick that reconciles a submitted slice re-plans before buying, so the current slot is not lost.

Use the same `--home` (desk directory) for every tick of a mandate.

## Claude Code

Inside a session, repeat a prompt on an interval:

```text
/loop 24h Use $mermail-xstocks-dca to run one tick for standing order #<shortId>
```

For a demonstration, use a mandate with `"every": "PT3M"` and `/loop 3m`. For unattended daily runs, a scheduled routine or the operating system scheduler calling the CLI headlessly works the same way:

```bash
claude -p "Use \$mermail-xstocks-dca to run one tick for standing order #<shortId>"
```

## Codex

Create an automation in the Codex app with the prompt `Use $mermail-xstocks-dca to run one tick for standing order #<shortId>` and the mandate's cadence.

## OpenClaw

Add a cron job whose message is the same tick prompt, at the mandate's cadence.

## cron

```cron
0 14 * * * cd /path/to/workdir && claude -p 'Use $mermail-xstocks-dca to run one tick for standing order #<shortId>'
```

Any host works as long as it runs an agent with the Mermail MCP server connected over OAuth (the Agent Wallet is not available to API keys).

## Choosing a cadence

- Cadence (`every`) is the slot length; the anchor fixes where slots start. Daily buys at 14:00 UTC: `"every": "P1D"`, `"anchor": "2026-10-06T14:00:00Z"`.
- The scheduler only needs to fire at least once per slot. Running it more often is harmless.
- Statements follow `statementEvery` and go out on the first tick after they fall due.
