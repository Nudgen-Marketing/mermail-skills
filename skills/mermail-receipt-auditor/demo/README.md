# Receipt auditor demo

Reproducible demo used for the bounty video: a local JSONL corpus of
"emails" (same shape `get_email` returns) is classified/extracted per
references/tools.md, and every ledger mutation goes through
scripts/ledger.py exactly as it would live.

Run:
    python3 demo.py

Includes a receipt-borne prompt-injection email (pay + forward demands)
that must be recorded as data and never executed. The generated
demo-ledger/ directory is disposable; do not commit it.
