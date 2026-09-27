# Templates

Write memos as plain text. Take prices and multiples from the script's `display` block so small prices print as decimals, never in exponent form.

## Subject

```text
[Exit Desk] <full mint> <SYMBOL> <status>
```

Copy the script's `display.subject`. `<SYMBOL>` is `display.symbol`: the pool's base symbol reduced to letters, digits, and `$ _ . -`, at most 12 characters. The mint comes first so one subject filter finds every memo for the position.

## Exit memo

```text
Verdict: <status>
Rule: <reason>
Rule outcome: <hold | sell half | sell all>

Position
  Mint: <mint>
  Entry: $<display.entry_usd> at <opened_at>
  Price now: $<display.price_usd> (<display.multiple> of entry)
  Peak recorded: $<display.peak_usd> (<display.peak_multiple>), price is <drop_from_peak_pct>% under it
  Held: <hours_held> hours. Time stop at <time_stop_at>
  Half sold: <yes | no>
  Memory: <rows_used> ledger rows used, <rows_ignored> ignored

Levels
  Take half at: $<display.take_half_usd>
  Trailing stop at: <$ + display.trail_usd, or display.trail_usd as given when not armed>
  Cut at: $<display.cut_usd>

Pool
  <dex> <pair>, quoted in <quote>, liquidity $<display.liquidity_usd>, valuation $<display.fdv_usd>

Evidence (<coverage>, as of <as_of>)
  Graduation: <instant | organic | not_graduated>
  Creator: <prior_launches> launches, <prior_graduations> graduations; cluster <cluster_launches> launches, <cluster_rug_graduations> rugs
  Flags: <desk_flags, comma-separated, or none>
  Base rates, organic graduates only, since <base_rates_from>: up at 1h <p as %> (n=<n>); up at 24h <p as %> (n=<n>)

These are fixed rules applied to the entry you stated. They are not a forecast and not investment advice.

<ledger>
```

Rules for the memo:

- One ledger line, on its own line, last. Copy the script's `ledger` field unchanged.
- Times are ISO-8601 in UTC. Rates are percentages with one decimal and always carry their `n`.
- When coverage is `partial`, replace the Graduation, Creator, and Flags lines with `Launch not observed: no launch-derived facts are used.` Keep the base rates.
- When coverage is `none` or `unavailable`, replace the whole Evidence block with one line saying so.

## Ledger line

```text
EXIT-DESK-LEDGER v1 | mint=<mint> | entry_usd=<decimal> | opened_at=<ISO> | peak_usd=<decimal> | took_half=<true|false> | observed_at=<ISO> | price_usd=<decimal>
```

`took_half` is `true` only after a sale of at least half the position is confirmed or the user states one. The reminder carries no ledger line. A `take_half` verdict alone leaves it `false`.

## Worked example

Request: "Check my exit on `DHzjVpsQPzcZP7ugHTD4N9yNHRvSB6NGVQinawRwpump`. I bought at $0.0004 at 17:35 UTC on 2026-09-26. Write the memo and save it as a draft." Evaluated at 2026-09-27T13:50:00Z.

```bash
node scripts/exit-verdict.mjs --mint DHzjVpsQPzcZP7ugHTD4N9yNHRvSB6NGVQinawRwpump \
  --entry-usd 0.0004 --opened-at 2026-09-26T17:35:00Z --now 2026-09-27T13:50:00Z
```

```text
Subject: [Exit Desk] DHzjVpsQPzcZP7ugHTD4N9yNHRvSB6NGVQinawRwpump MrBeast cut

Verdict: cut
Rule: price is 0.00746x entry, at or under 0.5x
Rule outcome: sell all

Position
  Mint: DHzjVpsQPzcZP7ugHTD4N9yNHRvSB6NGVQinawRwpump
  Entry: $0.0004 at 2026-09-26T17:35:00.000Z
  Price now: $0.000002985 (0.00746x of entry)
  Peak recorded: $0.0004 (1x), price is 99.25% under it
  Held: 20.25 hours. Time stop at 2026-09-26T23:35:00.000Z
  Half sold: no
  Memory: 0 ledger rows used, 0 ignored

Levels
  Take half at: $0.0008
  Trailing stop at: not armed until 1.3x
  Cut at: $0.0002

Pool
  pumpswap 679n7pNezPawzgQbNrYLiqjqWUa9oksYWX4VSAQKwuqu, quoted in SOL, liquidity $2,934, valuation $2,972

Evidence (full, as of 2026-09-27T13:31:13Z)
  Graduation: instant
  Creator: 0 launches, 0 graduations; cluster 2 launches, 0 rugs
  Flags: creator-bought curve, copycat name, no socials
  Base rates, organic graduates only, since 2026-09-20T00:00:00.000Z: up at 1h 14.6% (n=1,724); up at 24h 5.8% (n=1,516)

These are fixed rules applied to the entry you stated. They are not a forecast and not investment advice.

EXIT-DESK-LEDGER v1 | mint=DHzjVpsQPzcZP7ugHTD4N9yNHRvSB6NGVQinawRwpump | entry_usd=0.0004 | opened_at=2026-09-26T17:35:00.000Z | peak_usd=0.0004 | took_half=false | observed_at=2026-09-27T13:50:00.000Z | price_usd=0.000002985
```

Two rules fired here: `cut` and `time_stop`. `cut` is reported because it comes first in the order.

## Time-stop reminder

```text
Subject: [Exit Desk] <full mint> <SYMBOL> time stop due

You bought <SYMBOL> at $<entry_usd> at <opened_at>. Six hours have passed.
The desk's rule outcome at the time stop is to sell what remains.
Ask the desk for a fresh check before you act: the price has moved since this was written.
```

## Sale preview

```text
Sell <token amount> <SYMBOL> (<full mint>) for USDC
Wallet: <wallet label>, Solana
Rule: <status> - <reason>, as of <observed_at>
PayBox will show the quote, fees, and minimum received before you sign.
Reply to confirm this exact sale.
```
