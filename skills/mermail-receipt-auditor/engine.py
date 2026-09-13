"""mermail-receipt-auditor — ledger engine (pure-python, no deps).

Implements the append-only ledger semantics defined in SKILL.md:
- schema validation for extracted records
- idempotent ingestion keyed on (vendor, amount_decimal, tx_date, source_message_id)
- derived CSV view regeneration
- evidence-cited query helpers and recurring-charge detection
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timedelta, timezone

KINDS = {
    "RECEIPT",
    "INVOICE",
    "PAYMENT_CONFIRMATION",
    "SUBSCRIPTION_NOTICE",
    "REFUND",
    "DUNNING",
    "NON_FINANCIAL",
}
DIRECTIONS = {"debit", "credit"}
CATEGORIES = {"api", "infra", "saas", "domain", "hardware", "other"}

IDEMPOTENCY_FIELDS = ("vendor", "amount_decimal", "tx_date", "source_message_id")
REQUIRED_FIELDS = IDEMPOTENCY_FIELDS + ("currency", "kind", "direction", "category", "record_id")


class LedgerError(ValueError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def validate_record(rec: dict) -> dict:
    """Validate one extracted record. Raises LedgerError on schema violations."""
    missing = [f for f in REQUIRED_FIELDS if f not in rec or rec[f] in (None, "")]
    if missing:
        raise LedgerError(f"missing required fields: {missing}")
    if rec["kind"] not in KINDS:
        raise LedgerError(f"kind {rec['kind']!r} not in {sorted(KINDS)}")
    if rec["direction"] not in DIRECTIONS:
        raise LedgerError(f"direction {rec['direction']!r} not in {sorted(DIRECTIONS)}")
    if rec["category"] not in CATEGORIES:
        raise LedgerError(f"category {rec['category']!r} not in {sorted(CATEGORIES)}")
    amt = str(rec["amount_decimal"])
    if not amt or not all(c.isdigit() or c in ".,-" for c in amt):
        raise LedgerError(f"amount_decimal must be a raw decimal string, got {amt!r}")
    if not isinstance(rec["amount_decimal"], str):
        # coerce numeric json values to string to preserve exactness going forward
        rec["amount_decimal"] = amt
    # ISO-8601 check
    try:
        datetime.fromisoformat(rec["tx_date"].replace("Z", "+00:00"))
    except (ValueError, AttributeError) as e:
        raise LedgerError(f"tx_date not ISO-8601: {rec.get('tx_date')!r}") from e
    return rec


class Ledger:
    def __init__(self, root: str):
        self.root = root
        self.jsonl_path = os.path.join(root, "ledger.jsonl")
        self.review_dir = os.path.join(root, "review")
        os.makedirs(self.root, exist_ok=True)
        os.makedirs(self.review_dir, exist_ok=True)
        self.records: list[dict] = []
        self._index: set[tuple] = set()
        if os.path.exists(self.jsonl_path):
            self._load()

    def _load(self) -> None:
        with open(self.jsonl_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                self.records.append(rec)
                if rec.get("type") != "correction":
                    self._index.add(self._key(rec))

    @staticmethod
    def _key(rec: dict) -> tuple:
        return tuple(str(rec.get(f)) for f in IDEMPOTENCY_FIELDS)

    def _append_line(self, rec: dict) -> None:
        with open(self.jsonl_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def ingest(self, rec: dict) -> str:
        """Append one validated record. Returns 'ingested' or 'duplicate'."""
        rec = validate_record(dict(rec))
        key = self._key(rec)
        if key in self._index:
            return "duplicate"
        self.records.append(rec)
        self._index.add(key)
        self._append_line(rec)
        return "ingested"

    def correct(self, record_id: str, fixes: dict, reason: str) -> str:
        """Append a correction record (history is never rewritten)."""
        target = self.get(record_id)
        if target is None:
            raise LedgerError(f"no record {record_id}")
        corr = {
            "type": "correction",
            "corrects": record_id,
            "reason": reason,
            "fixes": fixes,
            "record_id": f"corr-{len(self.records) + 1:06d}",
            "created_at": _utcnow().isoformat(),
        }
        self.records.append(corr)
        self._append_line(corr)
        return corr["record_id"]

    def get(self, record_id: str) -> dict | None:
        for r in self.records:
            if r.get("record_id") == record_id:
                return r
        return None

    def effective_records(self) -> list[dict]:
        """Records with corrections applied (corrections stay in the file)."""
        out = []
        fixes: dict[str, dict] = {}
        for r in self.records:
            if r.get("type") == "correction":
                fixes[r["corrects"]] = r["fixes"]
                continue
            out.append(r)
        for r in out:
            if r["record_id"] in fixes:
                r = {**r, **fixes[r["record_id"]], "corrected": True}
        return [({**r, **(fixes.get(r["record_id"], {})), "corrected": r["record_id"] in fixes}) for r in out]

    def quarantine(self, message_id: str, reason: str, payload: dict | None = None) -> str:
        """Route ambiguous mail to review/ — never into the ledger."""
        safe = "".join(c for c in message_id if c.isalnum() or c in "-_")[:80] or "unknown"
        path = os.path.join(self.review_dir, f"{safe}.json")
        doc = {"message_id": message_id, "reason": reason, "payload": payload or {}, "at": _utcnow().isoformat()}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2)
        return path

    # ---------- derived views ----------

    def regenerate_csv(self, csv_path: str | None = None) -> str:
        csv_path = csv_path or os.path.join(self.root, "ledger.csv")
        cols = [
            "record_id", "vendor", "amount_decimal", "currency", "tx_date",
            "kind", "direction", "category", "tx_ref", "source_message_id",
            "currency_inferred", "corrected",
        ]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for r in self.effective_records():
                w.writerow({c: r.get(c, "") for c in cols})
        return csv_path

    # ---------- queries ----------

    def _filter(self, records, category=None, vendor=None, kind=None, since=None, until=None):
        def ok(r):
            if category and r.get("category") != category:
                return False
            if vendor and vendor.lower() not in str(r.get("vendor", "")).lower():
                return False
            if kind and r.get("kind") != kind:
                return False
            d = r.get("tx_date", "")
            if since and d < since:
                return False
            if until and d > until:
                return False
            return True
        return [r for r in records if ok(r)]

    def spend(self, category=None, vendor=None, kind=None, since=None, until=None) -> dict:
        """Evidence-cited spend total over effective records (debits minus credits, per currency)."""
        rows = self._filter(self.effective_records(), category, vendor, kind, since, until)
        by_currency: dict[str, dict] = {}
        for r in rows:
            cur = r.get("currency") or "UNKNOWN"
            amt = r["amount_decimal"].replace(",", "")
            try:
                val = float(amt)
            except ValueError:
                val = 0.0
            sign = -1.0 if r.get("direction") == "credit" else 1.0
            slot = by_currency.setdefault(cur, {"total": 0.0, "count": 0, "evidence": []})
            slot["total"] += sign * val
            slot["count"] += 1
            slot["evidence"].append(
                {"record_id": r.get("record_id"), "vendor": r.get("vendor"),
                 "amount": r["amount_decimal"], "tx_date": r.get("tx_date"),
                 "source_message_id": r.get("source_message_id")}
            )
        return {"by_currency": by_currency, "range": [since, until]}

    def recurring(self, window_days: int = 45, min_occurrences: int = 2) -> list[dict]:
        """Same vendor + amount within rolling window → cadence estimate."""
        rows = [r for r in self.effective_records() if r.get("direction") == "debit"]
        groups: dict[tuple, list[dict]] = {}
        for r in rows:
            groups.setdefault((r.get("vendor"), r["amount_decimal"]), []).append(r)
        cutoff = (_utcnow() - timedelta(days=window_days)).date().isoformat()
        out = []
        for (vendor, amt), rs in groups.items():
            dates = sorted(x["tx_date"][:10] for x in rs if x["tx_date"][:10] >= cutoff)
            if len(dates) >= min_occurrences:
                gaps = [(datetime.fromisoformat(b) - datetime.fromisoformat(a)).days
                        for a, b in zip(dates, dates[1:])]
                med_gap = sorted(gaps)[len(gaps) // 2] if gaps else None
                out.append({"vendor": vendor, "amount_decimal": amt, "dates": dates,
                            "median_gap_days": med_gap})
        return out


def parse_iso_date(s: str) -> str:
    """Normalize common printed dates to ISO (best-effort, never guesses time)."""
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%B %d, %Y", "%b %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise LedgerError(f"unparseable date: {s!r}")
