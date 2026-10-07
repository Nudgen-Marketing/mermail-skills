# Evidence classes and half-lives

The half-life of a class is fixed when the gate is frozen, before any evidence
is read. It is never adjusted afterwards. An expiry chosen after seeing the
evidence is not an expiry — it is a justification.

**The default durations below are a starting proposal, pending the maintainer
answer to open question 1 of issue #262** (half-lives declared per class in the
skill, versus read from a user-supplied policy at gate-freeze time). The
mechanism does not depend on the exact numbers: it depends on the durations
being fixed before reading and attached to the verdict. Where a user supplies a
policy, that policy is recorded verbatim in the frozen gate and overrides these.

| Class | What it covers | Proposed default | Why |
| --- | --- | --- | --- |
| `commitment` | Signed terms, countersigned agreements, an accepted quote with a stated validity date | The stated validity date, else 90 days | Its own document usually carries the expiry; use that first |
| `stated_intent` | "We plan to", "we should be able to", a non-binding forecast | 14 days | Intent drifts without notice and is rarely retracted explicitly |
| `operational_state` | Stock, capacity, availability, queue depth, headcount, a current count | 24 hours | Changes continuously and silently |
| `price_quote` | A price, rate, or fee without a stated validity window | 7 days | Repriced on vendor cycles the mailbox cannot observe |
| `schedule_claim` | A delivery date, milestone, or availability window | Until the named date, else 14 days | Anchored to a date the message itself supplies |
| `third_party_report` | A forwarded metric, dashboard figure, or external measurement | 24 hours, or the report's own measurement window when narrower | Inherits the freshness of its own source, never better |

## Rules that hold regardless of the numbers

- The verdict inherits the **shortest** half-life among the items it actually
  depends on — not the shortest among everything read. An expired item that no
  condition rests on does not expire the verdict.
- A stated validity date in the evidence always wins over a class default when
  it is **shorter**. A longer stated validity does not extend a class default;
  a vendor asserting "valid 12 months" does not make stock levels durable.
- When an item's class is ambiguous, use the shorter-lived candidate class and
  record the ambiguity as a limitation.
- A claim about a fact and the fact itself are different items. "They said the
  slot is still open" is `stated_intent`; the slot being open is
  `operational_state` and requires its own observation.
- Half-lives are wall-clock from `observed_at`, the timestamp of the read that
  produced the item — never from the message's `Date` header.
