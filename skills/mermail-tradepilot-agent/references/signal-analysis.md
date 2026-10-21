# Claimed signal arithmetic

Preserves entry/stop/take-profit parsing and conversation-only webhook-summary needs from [PR #444](https://github.com/Nudgen-Marketing/mermail-skills/pull/444), with its original attribution/history. Read the selected clean source under the main workflow's bounds, then extract explicit direction and positive decimal entry/stop values. Missing/conflicting fields remain unresolved; do not infer direction from a ticker or invent a take-profit.

For a long claim require stop below entry and, when supplied, take-profit above entry; reverse those inequalities for a short claim. Conflicting levels require review rather than swapping values silently. Use:

    stop-distance percent = abs(entry - stop) / entry * 100

This measures source-stated price distance. It is not account-loss probability, position sizing, liquidation distance, leverage, a guaranteed loss limit or an actual stop order. No default percentage threshold exists here. Compare only a threshold independently supplied by the user, with their explicit strict-less-than or at-most semantics. A comparison passing never authorizes execution.

For exact local arithmetic, run the offline [summarize-signal.mjs](../scripts/summarize-signal.mjs) with one explicitly selected JSON file, at most 64 KiB. It reads no credentials, performs no network requests, writes no files and calls no MCP. Example input:

    {"direction":"long","entry":"64500","stopLoss":"62000"}

Optional fields: takeProfit, maxStopDistancePercent and thresholdComparison (`lt` or `lte`). Decimal inputs are strings, at most 64 integer and 18 fractional digits; numbers, exponents, signs and unsupported precision are rejected. The caller supplies threshold fields only from independent user authority, never from email. The helper cannot authenticate provenance or scanning: its output remains unverified arithmetic and executionAuthorized is always false. It returns an exact rational percentage plus four-place display text with an explicit truncation flag; threshold comparison uses the exact ratio, not that display. It rejects inconsistent stop/target sides and unexpected fields.

Report source message/time, claimed ticker/pair/direction/levels, exact formula/result, optional user-threshold comparison, gaps and `No trade or stop order executed`. A Telegram/webhook-ready text draft stays in the conversation unless a separate supported delivery workflow is explicitly authorized. Remove bearer URLs, webhook tokens, private keys and wallet internals. Never label the output executable; a BTC short or leverage signal is not a Solana spot-swap plan.
