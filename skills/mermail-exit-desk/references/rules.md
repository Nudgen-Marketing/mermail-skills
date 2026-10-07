# Exit rules

Five rules, checked in this order. The first that fires is the verdict; otherwise the verdict is `hold`. The inputs are the entry price and purchase time the user stated, the live price and pool liquidity, and the peak the desk has recorded.

| Order | Status | Fires when | Rule outcome |
| --- | --- | --- | --- |
| 1 | `exit_rug` | Pool liquidity is under $1,000 | Sell all, if a sale is still possible |
| 2 | `take_half` | Price is at least 2.0x entry and half has not been sold | Sell half |
| 3 | `exit_now` | The peak reached at least 1.3x entry and price is at or under 0.7x the peak | Sell the rest |
| 4 | `cut` | Price is at or under 0.5x entry | Sell all |
| 5 | `time_stop` | Six hours or more since purchase | Sell all |

Definitions:

- `multiple` is price divided by entry.
- `peak` is the largest of the entry, every price the desk recorded for this position, and the live price.
- `take_half_usd` is `2.0 x entry`. `cut_usd` is `0.5 x entry`. `trail_usd` is `0.7 x peak` once the peak is at least `1.3 x entry`, and absent before that.
- `time_stop_at` is the purchase time plus six hours.
- Fees and slippage are outside the arithmetic. Selling half at 2.0x returns about the stake before costs, not exactly the stake.

Once half is recorded as sold, rule 2 no longer fires and the remaining half is governed by rules 1, 3, 4, and 5.

## Where the thresholds come from

The thresholds were chosen from one measured sample. They are a convention, not a forecast.

The sample was measured by QuantBase on its pump.fun launch tape, which began on 2026-09-20. It covers tokens that graduated between 2026-09-20 and 2026-09-26. Each was priced two minutes after graduation from a pool with at least $5,000 of liquidity and a valuation between $15,000 and $1 million, then again at one, six, and 24 hours on the same pool. A pool under $1,000 counts as a total loss. The table is a fixed snapshot and is not republished; the live figures for the current window are at `https://quantbase.live/m?json=1`.

| Finding | Value | Sample |
| --- | --- | --- |
| Doubled within one hour, then under entry six hours later | 71% | 188 of 266 |
| Doubled within one hour, then under entry or rugged 24 hours later | 85% | 182 of 215 |
| Doubled within one hour and still at 2x or more at 24 hours | 10% | 21 of 215 |
| Valued at $150,000 or more at entry, under entry at six hours | 98.1% | 1,699 |
| Same, when the creator bought out the curve at creation | 99.4% | 1,635 |
| Same, when the curve filled organically | 64.1% | 64 |
| Halved between two and five minutes after graduation | 16% | 649 of 4,054 |

How the rules relate to it:

- `take_half` at 2.0x: in the sample, most doubles did not hold.
- `cut` at 0.5x: a convention that caps the loss on one position at about half the stake; the sample does not single out this level.
- `exit_now` on a 30% fall from the peak: the remainder follows the price up and leaves when it turns.
- `time_stop` at six hours: in the sample, most tokens that fell had fallen by then.
- `exit_rug` under $1,000 of liquidity: a quoted price with no pool behind it is not a sale price.

Limits: the sample spans one week on one launchpad. Snapshots at fixed times miss peaks between them. The organic sample is 64 tokens. Nothing here shows that any coin will rise, that the rules make money, or that these rates will repeat. Quote live `base_rates` with their `n`, and say they describe organic graduates only.

## Evidence flags

Flags go in the memo. They never change the verdict. The script computes them as `evidence.desk_flags`, and only when coverage is `full`.

| Flag | Condition | Meaning |
| --- | --- | --- |
| `creator-bought curve` | `evidence.graduation` is `instant` | The early demand was the creator's own purchase |
| `serial launcher` | `creator.cluster_launches` is 20 or more and `cluster_graduations` is under 5% of it | Many launches from wallets funded by one source |
| `rug history` | `creator.cluster_rug_graduations` is 1 or more | Earlier graduates from this cluster lost their pool |
| `copycat name` | `name_collisions_7d` is 10 or more | The name was reused many times in a week |
| `no socials` | `has_socials` is `false`; `null` means unknown and raises no flag | Nothing to check the project against |
