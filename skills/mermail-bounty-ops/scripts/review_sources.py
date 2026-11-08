"""One-shot public bounty discovery. Offline by default; no credentials or writes.

Output is unverified source data, never application/payment/delivery authority.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from review_inbox import NoRedirect, read_json, state_path, identity, instant, MAX_BYTES


def text(value, limit=2000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("Missing/oversized source text")
    return value


def number(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{1,18}(?:\.\d{1,6})?", value):
        raise ValueError("Use bounded nonnegative decimal strings, not floats")
    return Decimal(value)


def profile(value):
    if not isinstance(value, dict) or set(value) != {"mailbox", "keywords", "minimum", "currency", "sources", "repos"}:
        raise ValueError("Invalid owner-selected profile fields")
    identity(value["mailbox"])
    keys, sources, repos = value["keywords"], value["sources"], value["repos"]
    if not isinstance(keys, list) or not 1 <= len(keys) <= 12 or any(not isinstance(k, str) or not k.strip() or len(k) > 80 for k in keys):
        raise ValueError("Choose one to twelve skill keywords")
    number(value["minimum"])
    if value["currency"] not in ("USD", "USDC", "USDG"):
        raise ValueError("Choose one quoted unit; currencies are not interchangeable")
    if not isinstance(sources, list) or not sources or len(set(sources)) != len(sources) or set(sources) - {"github", "superteam"}:
        raise ValueError("Choose explicit supported public sources")
    if not isinstance(repos, list) or len(repos) > 3 or any(not isinstance(r, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", r) for r in repos):
        raise ValueError("At most three exact GitHub repositories")
    if "github" in sources and not repos:
        raise ValueError("GitHub requires owner-selected repositories")
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def source_urls(p):
    profile(p)
    urls = {}
    if "github" in p["sources"]:
        query = "is:issue is:open label:bounty " + " ".join("repo:" + r for r in p["repos"])
        urls["github"] = "https://api.github.com/search/issues?" + urllib.parse.urlencode({"q": query, "per_page": 25, "sort": "updated", "order": "desc"})
    if "superteam" in p["sources"]:
        urls["superteam"] = "https://superteam.fun/api/listings"
    return urls


def fetch(url, opener=None):
    # URLs only come from source_urls, never from source text or response links.
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or (parsed.netloc, parsed.path) not in (("api.github.com", "/search/issues"), ("superteam.fun", "/api/listings")) or parsed.fragment:
        raise ValueError("Unsupported public source")
    reader = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "mermail-bounty-review"}, method="GET")
    with reader.open(request, timeout=15) as response:
        if response.geturl() != url or response.status != 200 or response.headers.get_content_type() != "application/json":
            raise ValueError("Source changed URL/status/content type")
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError("Source response exceeds 1 MiB")
        return json.loads(raw)


def acquire(p, getter=fetch):
    snapshots, errors = {}, {}
    for source, url in source_urls(p).items():
        try:
            snapshots[source] = getter(url)
        except Exception:
            # No raw errors: URLs/body snippets can contain attacker text.
            errors[source] = "source_unavailable_no_retry"
    return snapshots, errors


def listings(source, raw, p):
    if source == "github":
        if not isinstance(raw, dict) or not isinstance(raw.get("items"), list) or type(raw.get("incomplete_results")) is not bool or type(raw.get("total_count")) is not int:
            raise ValueError("Unsupported GitHub search shape")
        items = raw["items"]
        partial = raw["incomplete_results"] or raw["total_count"] > len(items)
    else:
        items = raw if isinstance(raw, list) else raw.get("listings") if isinstance(raw, dict) else None
        partial = True  # No verified total/cursor contract; never claim exhaustive.
    if not isinstance(items, list) or len(items) > 50 or any(not isinstance(x, dict) for x in items):
        raise ValueError("At most fifty source records")
    partial = partial or len(items) > 25
    items = items[:25]  # Shared two-source pass: at most fifty records interpreted.
    output = []
    for item in items:
        title = text(item.get("title"), 300)
        if source == "github":
            url = item.get("html_url")
            match = re.fullmatch(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/issues/([1-9]\d*)", str(url))
            if not match or match[1].lower() not in {r.lower() for r in p["repos"]} or "pull_request" in item:
                raise ValueError("Unexpected repository/issue identity")
            if item.get("state") != "open":
                continue
            updated = text(item.get("updated_at"), 40)
            instant(updated)
            output.append({"id": url, "title": title, "description": text(item.get("body") or ""), "status": "open", "updated_at": updated,
                           "amount": None, "currency": None, "deadline": None, "agent_access": "unknown"})
        else:
            slug = text(item.get("slug"), 200)
            if not re.fullmatch(r"[A-Za-z0-9_-]+", slug):
                raise ValueError("Invalid listing slug")
            amount = item.get("rewardAmount")
            # Bounded integers are exact; floats may be rounded. Neither is individual income.
            quoted = amount if isinstance(amount, str) else str(amount) if type(amount) is int else None
            if quoted is not None:
                number(quoted)
            output.append({"id": "https://superteam.fun/earn/listing/" + slug, "title": title,
                           "description": text(item.get("description") or item.get("type") or ""),
                           "status": {"OPEN": "open", "PUBLISHED": "published", "open": "open", "published": "published"}.get(str(item.get("status")), "unknown_or_closed"), "amount": quoted, "currency": text(item.get("token") or "unknown", 40),
                           "deadline": item.get("deadline"), "agent_access": text(item.get("agentAccess") or "unknown", 80)})
    if len({x["id"] for x in output}) != len(output):
        raise ValueError("Duplicate source identities; review revisions")
    return output, partial


def review(p, snapshots, as_of, manifest=None, errors=None):
    pid = profile(p)
    now = instant(as_of)
    if not isinstance(snapshots, dict) or set(snapshots) - set(p["sources"]):
        raise ValueError("Snapshot sources must match selected profile")
    records = {}
    if manifest is not None:
        if not isinstance(manifest, dict) or manifest.get("profile_digest") != pid or not isinstance(manifest.get("records"), list) or len(manifest["records"]) > 1000:
            raise ValueError("Mismatched or invalid delivery manifest")
        for record in manifest["records"]:
            if not isinstance(record, dict) or record.get("state") not in ("delivered", "pending", "uncertain") or not isinstance(record.get("id"), str) or not re.fullmatch(r"[a-f0-9]{64}", str(record.get("fingerprint"))):
                raise ValueError("Invalid delivery record")
            if record["id"] in records:
                raise ValueError("Duplicate delivery identity")
            if record["state"] == "delivered" and (not isinstance(record.get("emailId"), str) or not record["emailId"].strip()):
                raise ValueError("Confirmed delivery needs exact emailId")
            records[record["id"]] = record
    cards, filtered, failures, coverage = [], [], dict(errors or {}), {}
    for source in p["sources"]:
        try:
            rows, partial = listings(source, snapshots[source], p)
        except (ValueError, TypeError, KeyError, AttributeError):
            failures.setdefault(source, "source_unavailable_or_unsupported_shape")
            continue
        coverage[source] = {"fetched": len(rows), "partial": partial}
        for row in rows:
            fingerprint = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
            old = records.get(row["id"])
            reason = None
            if old and old["state"] != "delivered":
                reason = "delivery_uncertain_hold_no_replay"
            elif old and old["fingerprint"] == fingerprint:
                reason = "already_delivered_unchanged"
            elif row["status"] not in ("open", "published"):
                reason = "status_unknown_or_closed"
            try:
                if row["deadline"] and instant(row["deadline"]) <= now:
                    reason = "expired"
            except (ValueError, TypeError, AttributeError):
                reason = reason or "deadline_ambiguous_hold"
            hits = [k for k in p["keywords"] if k.lower() in (row["title"] + " " + row["description"]).lower()]
            if not hits:
                reason = reason or "no_keyword_fit"
            # Different/unknown units and pools remain holds; no assumed dollar parity.
            if row["amount"] is not None and row["currency"] == p["currency"] and number(row["amount"]) < number(p["minimum"]):
                reason = reason or "quoted_total_below_same_unit_floor"
            if reason:
                filtered.append({"id": row["id"], "reason": reason})
                continue
            cards.append({**row, "fingerprint": fingerprint, "keyword_hits": hits, "updated_since_delivery": bool(old),
                          "verdict": "needs_verification", "payout_type": "unknown_not_individual_income",
                          "verification_required": ["original rules/deadline", "individual payout/unit and funding history", "owner/agent eligibility and costs", "GitHub linked merged PR or prior claim where applicable"]})
    cards.sort(key=lambda x: (-len(x["keyword_hits"]), x["id"]))
    return {"as_of": as_of, "profile_digest": pid, "cards": cards[:10], "not_shortlisted": len(cards[10:]), "filtered": filtered,
            "source_coverage": coverage, "source_errors": failures, "delivery_performed": False, "execution_authorized": False,
            "limits": "Claim-only lexical shortlist. No reward conversion, automatic eligibility, payout assurance or recurring monitoring."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--input")
    mode.add_argument("--live", action="store_true")
    parser.add_argument("--manifest")
    parser.add_argument("--as-of", required=True)
    args = parser.parse_args()
    try:
        p = read_json(state_path(args.profile))
        profile(p)
        instant(args.as_of)
        manifest = read_json(state_path(args.manifest)) if args.manifest else None
        # Validate local manifest before any opt-in public read.
        review(p, {}, args.as_of, manifest)
        if args.live:
            snapshots, errors = acquire(p)
        else:
            snapshots, errors = read_json(state_path(args.input)), {}
        print(json.dumps(review(p, snapshots, args.as_of, manifest, errors), ensure_ascii=True, indent=2))
    except Exception:
        print("Source review failed; preserve inputs and inspect privately. No delivery performed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
