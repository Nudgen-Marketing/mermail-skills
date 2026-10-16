# Fixtures — Mermail RFQ Desk

Synthetic, self-contained corpus for analyzer regression checks and no-send
dry runs. All content is fabricated for testing and labeled as such; it
mirrors the exact formats in [../templates.md](../templates.md).

- `rfq-2026-003-thread.md` — two-vendor engagement: RFQ out, two quote
  replies, one counter round, one late reply, one authentication-weak sender.
- `expected-comparison-matrix.md` — the deterministic expected output:
  extracted fields, weighted scores, flags, and the award the desk should
  propose.

Run the dry-run procedure in [../troubleshooting.md](../troubleshooting.md).
