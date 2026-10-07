#!/usr/bin/env python3
"""Deterministic helpers for the mermail-expense-ledger skill. Standard library only.

  ledger.py extract   emails.json ledger.csv                 one row per email (upsert by email_id)
  ledger.py reconcile ledger.csv transactions.csv out.md     matched / missing / conflicts report
  ledger.py drafts    out.md drafts.json                     draft bodies for receipt requests and disputes

emails.json: [{"email_id", "mailbox_id", "from", "from_name", "subject", "date", "text", "auth_status"}]
transactions.csv: date,amount,currency,description[,reference]   (ISO dates; negative amount = refund)
"""
import csv, json, re, sys, os
from datetime import date, datetime, timedelta

CURRENCIES = {"EUR": ["€", "eur", "euro", "euros"], "USD": ["$", "usd", "us$"], "GBP": ["£", "gbp"], "CHF": ["chf"],
              "JPY": ["¥", "jpy"], "USDC": ["usdc"], "USDT": ["usdt"], "SOL": ["sol"], "BTC": ["btc", "₿"]}
SYMBOL_TO_CODE = {"€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "₿": "BTC"}
TOTAL_WORDS = r"(?<!sub)(?<!sub-)(?<!sub )(?:grand\s+total|total\s+(?:amount|charged|paid|due)|amount\s+(?:charged|paid|due)|order\s+total|totale|importo|montant|gesamt(?:betrag)?|betrag|total|charged|paid|payment\s+of|amount)"
NUM = r"(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)"
CUR = r"(€|\$|£|¥|₿|EUR|USD|GBP|CHF|JPY|USDC|USDT|SOL|BTC)"
PAT_TOTAL = re.compile(TOTAL_WORDS + r"\s*[:\-]?\s*(?:" + CUR + r"\s*" + NUM + r"|" + NUM + r"\s*" + CUR + r")", re.I)
PAT_ANY = re.compile(r"(?:" + CUR + r"\s*" + NUM + r"|" + NUM + r"\s*" + CUR + r")")
PAT_ORDER = re.compile(r"(?:order|invoice|receipt|transaction|ref(?:erence)?|confirmation)\s*(?:number|no\.?|#|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/]{4,})", re.I)
PAT_LAST4 = re.compile(r"(?:ending(?: in)?|last\s*4|\*{2,}|x{2,}|•{2,})\s*(\d{4})\b", re.I)
PAT_TAX = re.compile(r"(?:tax|vat|iva|tva|mwst)\s*(?:\(\d+%\))?\s*[:\-]?\s*(?:" + CUR + r"\s*" + NUM + r"|" + NUM + r"\s*" + CUR + r")", re.I)
INJECTION = re.compile(r"(ignore (?:all |any )?(?:previous|prior) instructions|forward (?:this|the) (?:invoice|receipt|email) to|pay the attached|send (?:your|the) (?:password|account|card)|reply with your (?:account|card|password))", re.I)
FIELDS = ["email_id", "mailbox_id", "date", "merchant", "sender", "currency", "amount", "tax", "order_id", "payment_hint", "attachment_id", "confidence", "notes", "subject"]


def to_number(s):
    s = s.strip().replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".") if re.search(r",\d{2}$", s) else s.replace(",", "")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def cur_code(tok):
    tok = tok.strip()
    return SYMBOL_TO_CODE.get(tok, tok.upper())


def amounts(text, pat):
    out = []
    for m in pat.finditer(text):
        g = m.groups()
        if pat is PAT_TOTAL:
            c1, n1, n2, c2 = g[0], g[1], g[2], g[3]
        else:
            c1, n1, n2, c2 = g[0], g[1], g[2], g[3]
        cur = c1 or c2
        num = n1 or n2
        v = to_number(num) if num else None
        if v is not None and cur:
            out.append((cur_code(cur), v, m.group(0).strip()))
    return out


def parse_date(s):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%b %d, %Y", "%d %B %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s[:len(datetime.now().strftime(fmt)) + 6] if "%f" in fmt else s, fmt).date()
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
MONTHS.update({"gen": 1, "mag": 5, "giu": 6, "lug": 7, "ago": 8, "set": 9, "ott": 10, "dic": 12, "mär": 3, "mai": 5, "okt": 10, "dez": 12})


def parse_date_loose(s):
    """Dates as mail clients write them in forwarded headers: 'Tue, 8 Sep 2026 20:31', 'mar 8 set 2026, 20:31', '8 Sep 2026'."""
    m = re.search(r"(\d{1,2})\s+([A-Za-zäöü]{3,9})\.?\s+(\d{4})", s or "") or re.search(r"([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})", s or "")
    if not m: return None
    g = m.groups(); day, mon, year = (g[0], g[1], g[2]) if g[0].isdigit() else (g[1], g[0], g[2])
    mi = MONTHS.get(mon[:3].lower())
    try: return date(int(year), mi, int(day)) if mi else None
    except ValueError: return None


LEGAL = re.compile(r"\b(gmbh|spa|s\.p\.a\.|srl|s\.r\.l\.|ltd|llc|inc|corp|co|ag|sa|sas|bv|plc|online|billing|receipts?|payments?)\b\.?", re.I)


def merchant_key(name):
    """First significant word of a merchant name, ignoring legal suffixes and billing words: 'Hetzner Online' and
    'HETZNER ONLINE GMBH' both give 'hetzner'."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", LEGAL.sub(" ", name or "")) if w]
    return words[0].lower() if words else (name or "").lower()


def merchant_of(sender, from_name, text=""):
    m = re.search(r"(?im)^\s*(?:merchant|vendor|seller|from)\s*:\s*(.+?)\s*$", text or "")
    if m and m.group(1).strip():
        return m.group(1).strip()[:60]
    if from_name and from_name.strip():
        return re.sub(r"\s*(no-?reply|receipts?|billing|invoices?)\s*", " ", from_name, flags=re.I).strip(" -|") or from_name.strip()
    dom = sender.split("@")[-1].lower() if "@" in sender else sender
    parts = [p for p in dom.split(".") if p not in ("com", "net", "org", "io", "app", "co", "mail", "email", "e", "info", "it", "de", "fr", "uk")]
    return parts[-1].capitalize() if parts else dom


def extract_row(e):
    text = (e.get("text") or "") + "\n" + (e.get("subject") or "")
    notes = []
    inj = INJECTION.search(text)
    if inj:
        notes.append("security-note: instruction-like text ignored: " + inj.group(0)[:60])
    tot = amounts(text, PAT_TOTAL)
    conf = "high"
    if tot:
        cur, val, _ = max(tot, key=lambda t: t[1])
        if len({round(t[1], 2) for t in tot}) > 1:
            conf = "low"; notes.append("several totals: " + "; ".join(t[2][:30] for t in tot[:4]))
    else:
        anyv = amounts(text, PAT_ANY)
        if not anyv:
            return None
        cur, val, _ = max(anyv, key=lambda t: t[1]); conf = "low"; notes.append("no total keyword; largest amount used")
    tax = amounts(text, PAT_TAX)
    taxv = tax[0][1] if tax else ""
    order = PAT_ORDER.search(text)
    last4 = PAT_LAST4.search(text)
    if (e.get("auth_status") or "").lower() not in ("pass", "authenticated", "verified"):
        conf = "low"; notes.append("sender not authenticated")
    # (the "matched" window below is 3 days, so a wrong envelope date silently un-matches every forwarded receipt)
    # Forwarded or re-sent receipts carry the forwarding date in the envelope: prefer a date stated in the body
    # (the forwarded header's "Date:" line or the receipt's own date), falling back to the envelope date.
    d = None
    fwd = re.search(r"(?im)^\s*(?:date|data|datum|sent|inviato)\s*:\s*(.+?)\s*$", text)
    if fwd:
        d = parse_date(fwd.group(1)) or parse_date_loose(fwd.group(1))
    if not d:
        body_dates = [parse_date(m.group(0)) for m in re.finditer(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (?:[A-Z][a-z]{2,8}) \d{4}\b|\b[A-Z][a-z]{2,8} \d{1,2}, \d{4}\b", text)]
        body_dates = [x for x in body_dates if x]
        if body_dates: d = min(body_dates)
    if not d:
        d = parse_date(e.get("date")) or parse_date(text)
    return {"email_id": e["email_id"], "mailbox_id": e.get("mailbox_id", ""), "date": d.isoformat() if d else "",
            "merchant": merchant_of(e.get("from", ""), e.get("from_name", ""), e.get("text", "")), "sender": e.get("from", ""),
            "currency": cur, "amount": f"{val:.2f}", "tax": f"{taxv:.2f}" if taxv != "" else "",
            "order_id": order.group(1) if order else "", "payment_hint": ("*" + last4.group(1)) if last4 else "",
            "attachment_id": e.get("attachment_id", ""), "confidence": conf, "notes": " | ".join(notes),
            "subject": (e.get("subject") or "")[:120]}


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def cmd_extract(emails_json, ledger_csv):
    emails = json.load(open(emails_json, encoding="utf-8"))
    existing = {r["email_id"]: r for r in read_csv(ledger_csv)}
    added = updated = skipped = 0
    for e in emails:
        row = extract_row(e)
        if row is None:
            skipped += 1; continue
        if e["email_id"] in existing:
            if existing[e["email_id"]] != row:
                existing[e["email_id"]] = row; updated += 1
        else:
            existing[e["email_id"]] = row; added += 1
    rows = sorted(existing.values(), key=lambda r: (r["date"], r["merchant"]))
    write_csv(ledger_csv, rows, FIELDS)
    print(f"ledger: {len(rows)} rows ({added} added, {updated} updated, {skipped} emails without an amount)")


def cmd_reconcile(ledger_csv, tx_csv, out_md):
    L = read_csv(ledger_csv); T = read_csv(tx_csv)
    for t in T:
        t["_amt"] = abs(to_number(t["amount"]) or 0.0); t["_date"] = parse_date(t["date"]); t["_cur"] = (t.get("currency") or "").upper()
        t["_ref"] = t.get("reference") or t.get("id") or f"{t['date']} {t['description'][:30]} {t['amount']}"
    for r in L:
        r["_amt"] = float(r["amount"]); r["_date"] = parse_date(r["date"]); r["_used"] = False
    used_t = set(); matched = []
    for r in sorted(L, key=lambda r: r["date"]):
        # same amount within 3 days, or within 14 days when the merchant name is in the charge description
        # (card statements post late; forwarded receipts carry a later envelope date)
        cands = [t for i, t in enumerate(T) if i not in used_t and t["_cur"] == r["currency"] and abs(t["_amt"] - r["_amt"]) <= 0.01
                 and r["_date"] and t["_date"] and (abs((t["_date"] - r["_date"]).days) <= 3
                 or (merchant_key(r["merchant"]) in t["description"].lower() and abs((t["_date"] - r["_date"]).days) <= 14))]
        if not cands:
            continue
        cands.sort(key=lambda t: (0 if merchant_key(r["merchant"]) in t["description"].lower() else 1, abs((t["_date"] - r["_date"]).days)))
        t = cands[0]; used_t.add(T.index(t)); r["_used"] = True
        matched.append((r, t))
    no_tx = [r for r in L if not r["_used"]]
    no_receipt = [t for i, t in enumerate(T) if i not in used_t and (to_number(t["amount"]) or 0) > 0]
    conflicts = []
    seen = {}
    for r in L:
        key = (r["merchant"].lower(), r["currency"], r["amount"])
        for prev in seen.get(key, []):
            if r["_date"] and prev["_date"] and abs((r["_date"] - prev["_date"]).days) <= 1:
                conflicts.append(f"duplicate receipt: {r['merchant']} {r['currency']} {r['amount']} on {r['date']} (email_id {r['email_id']} and {prev['email_id']})")
        seen.setdefault(key, []).append(r)
    seen = {}
    for t in T:
        key = (t["description"].lower()[:20], t["_cur"], f"{t['_amt']:.2f}")
        for prev in seen.get(key, []):
            if t["_date"] and prev["_date"] and abs((t["_date"] - prev["_date"]).days) <= 1:
                conflicts.append(f"duplicate charge: {t['description'][:40]} {t['_cur']} {t['_amt']:.2f} on {t['date']} (refs {t['_ref']} and {prev['_ref']})")
        seen.setdefault(key, []).append(t)
    for r in no_tx:
        near = [t for i, t in enumerate(T) if i not in used_t and t["_cur"] == r["currency"] and merchant_key(r["merchant"]) in t["description"].lower()
                and abs(t["_amt"] - r["_amt"]) > 0.01 and r["_date"] and t["_date"] and abs((t["_date"] - r["_date"]).days) <= 7]
        for t in near:
            conflicts.append(f"amount mismatch: receipt {r['merchant']} {r['currency']} {r['amount']} (email_id {r['email_id']}) vs charge {t['_cur']} {t['_amt']:.2f} ({t['_ref']})")
    def cap(items, fmt):
        lines = [fmt(x) for x in items[:25]]
        if len(items) > 25:
            lines.append(f"... and {len(items) - 25} more")
        return lines or ["(none)"]
    md = ["# Reconciliation", "", f"ledger rows: {len(L)}, transactions: {len(T)}, matched: {len(matched)}", "",
          "## Matched", *cap(matched, lambda m: f"- {m[0]['date']} {m[0]['merchant']} {m[0]['currency']} {m[0]['amount']} = {m[1]['_ref']} (email_id {m[0]['email_id']})"), "",
          "## Receipt without transaction", *cap(no_tx, lambda r: f"- {r['date']} {r['merchant']} {r['currency']} {r['amount']} (email_id {r['email_id']}, confidence {r['confidence']})"), "",
          "## Transaction without receipt", *cap(no_receipt, lambda t: f"- {t['date']} {t['description'][:50]} {t['_cur']} {t['_amt']:.2f} (ref {t['_ref']})"), "",
          "## Conflicts", *cap(conflicts, lambda c: f"- {c}"), ""]
    notes = [r for r in L if "security-note" in (r.get("notes") or "")]
    if notes:
        md += ["## Security notes", *[f"- email_id {r['email_id']}: {r['notes']}" for r in notes[:25]], ""]
    open(out_md, "w", encoding="utf-8").write("\n".join(md))
    print(f"reconciliation: matched {len(matched)}, receipts without transaction {len(no_tx)}, transactions without receipt {len(no_receipt)}, conflicts {len(conflicts)}")


def cmd_drafts(rec_md, out_json):
    text = open(rec_md, encoding="utf-8").read()
    drafts = []
    sec = re.search(r"## Transaction without receipt\n(.*?)\n## ", text, re.S)
    for line in (sec.group(1).splitlines() if sec else []):
        m = re.match(r"- (\S+) (.+?) (\w{3,4}) ([\d.]+) \(ref (.+)\)", line)
        if m:
            d, desc, cur, amt, ref = m.groups()
            drafts.append({"kind": "receipt_request", "to": "", "subject": f"Receipt request for {cur} {amt} charged on {d}",
                           "body": f"Hello,\n\nI was charged {cur} {amt} on {d} (statement reference: {ref}, description: {desc.strip()}) but have no receipt or invoice for it. Could you send one to this address?\n\nThank you."})
    sec = re.search(r"## Conflicts\n(.*?)(\n## |\Z)", text, re.S)
    for line in (sec.group(1).splitlines() if sec else []):
        if line.startswith("- duplicate charge") or line.startswith("- amount mismatch"):
            drafts.append({"kind": "dispute", "to": "", "subject": "Question about a charge on my account",
                           "body": f"Hello,\n\nMy records show the following discrepancy:\n{line[2:]}\n\nCould you check it and, if it is an error, correct it?\n\nThank you."})
    json.dump(drafts, open(out_json, "w", encoding="utf-8"), indent=1)
    print(f"drafts: {len(drafts)} (to-address left empty for the user to fill or approve)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("extract", "reconcile", "drafts"):
        print(__doc__); sys.exit(1)
    {"extract": cmd_extract, "reconcile": cmd_reconcile, "drafts": cmd_drafts}[a[0]](*a[1:])
