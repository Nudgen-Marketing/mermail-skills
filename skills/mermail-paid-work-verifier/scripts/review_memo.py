"""Offline structural memo preflight, not fact/rights/payment verification."""
import argparse
import ipaddress
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Timezone required")
    return result.astimezone(timezone.utc)


def identity(value):
    keys = {"workspace_id", "mailbox_id", "job_id", "version"}
    if not isinstance(value, dict) or set(value) != keys or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", v) for v in value.values()):
        raise ValueError("Invalid identity")
    return value


def safe_url(value):
    if not isinstance(value, str) or len(value) > 2048 or re.search(r"[\s\\\x00-\x1f\x7f]", value):
        return False
    try:
        u = urlsplit(value)
        if u.scheme != "https" or u.username or u.password or u.port not in (None, 443) or u.query or u.fragment:
            return False
        host = u.hostname or ""
        if not re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", host) or any(part.lower().startswith("xn--") for part in host.split(".")):
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return not host.lower().endswith((".localhost", ".local", ".internal"))
    except (ValueError, TypeError):
        return False


def review(job, memo):
    if not isinstance(job, dict) or not isinstance(memo, dict) or identity(job.get("identity")) != identity(memo.get("identity")):
        raise ValueError("Wrong job/workspace/mailbox/version")
    now = instant(job["as_of"])
    age = job.get("max_age_seconds")
    if type(age) is not int or not 0 <= age <= 366 * 86400:
        raise ValueError("Owner must select freshness bound")
    sources, claims = memo.get("sources"), memo.get("claims")
    if not isinstance(sources, list) or len(sources) > 20 or not isinstance(claims, list) or not 1 <= len(claims) <= 30:
        raise ValueError("At most twenty sources and thirty claims")
    by_id, holds, result = {}, [], []
    def sid(value):
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", value):
            raise ValueError("Invalid reference id")
        return value
    for source in sources:
        if not isinstance(source, dict):
            raise ValueError("Source must be object")
        key = sid(source.get("id"))
        if key in by_id:
            raise ValueError("Duplicate source identity")
        excerpt = source.get("excerpt")
        if not isinstance(excerpt, str) or not excerpt or len(excerpt) > 10000:
            raise ValueError("Invalid bounded excerpt")
        reasons = []
        if not safe_url(source.get("url")):
            reasons.append("unsafe_or_noncanonical_url")
        if source.get("owner_reviewed") is not True or source.get("rights") != "approved_for_use":
            reasons.append("source_or_rights_not_reviewed")
        try:
            elapsed = (now - instant(source["checked_at"])).total_seconds()
            if elapsed < 0 or elapsed > age:
                reasons.append("source_stale_or_future")
        except (ValueError, KeyError, AttributeError, TypeError):
            reasons.append("missing_source_time")
        by_id[key] = (excerpt, reasons)
    seen = set()
    for claim in claims:
        if not isinstance(claim, dict):
            raise ValueError("Claim must be object")
        key = sid(claim.get("id"))
        if key in seen:
            raise ValueError("Duplicate claim identity")
        seen.add(key)
        if not isinstance(claim.get("text"), str) or not claim["text"].strip() or len(claim["text"]) > 2000:
            raise ValueError("Invalid bounded claim")
        citations = claim.get("citations", [])
        if not isinstance(citations, list) or len(citations) > 10:
            raise ValueError("Invalid citation list")
        reasons = []
        label = claim.get("label")
        valid_label = isinstance(label, str) and label in ("supported", "unverified")
        if not valid_label:
            reasons.append("missing_claim_label")
        if label == "unverified" and (not isinstance(claim.get("uncertainty"), str) or not claim["uncertainty"].strip()):
            reasons.append("missing_uncertainty_reason")
        if label == "supported" and not citations:
            reasons.append("unsupported_claim")
        if claim.get("conflicting_evidence") is not False:
            reasons.append("conflict_not_resolved_or_reviewed")
        for citation in citations:
            if not isinstance(citation, dict):
                raise ValueError("Citation must be object")
            source_id, quote = citation.get("source_id"), citation.get("quote")
            if not isinstance(source_id, str) or source_id not in by_id:
                reasons.append("unknown_citation")
                continue
            excerpt, source_holds = by_id[source_id]
            reasons.extend(source_holds)
            if not isinstance(quote, str) or not quote.strip() or len(quote) > 1000 or quote not in excerpt:
                reasons.append("quote_not_in_selected_evidence")
        result.append({"id": key, "label": label if valid_label else "invalid", "citation_count": len(citations)})
        holds.extend({"claim_id": key, "reason": r} for r in sorted(set(reasons)))
    return {"identity": job["identity"], "status": "held" if holds else "needs_owner_semantic_review",
            "claims": result, "holds": holds, "delivery_authorized": False,
            "limits": "Local evidence structure only; does not fetch sources, verify truth/rights/payment or authorize delivery. Owner review flags are supplied evidence, not attested by this helper."}


def read(path):
    p = Path(path).absolute()
    if p.resolve() != p or not p.is_file():
        raise ValueError("Choose existing non-symlink private inputs")
    with p.open("rb") as handle:
        raw = handle.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError("Input exceeds 1 MiB")
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job", required=True)
    parser.add_argument("--memo", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(review(read(args.job), read(args.memo)), ensure_ascii=True, indent=2))
    except Exception:
        print("Memo preflight failed; inspect private inputs. No source fetch or delivery performed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
