#!/usr/bin/env python3
"""claude-review: fetch a GitHub PR diff and emit a structured Markdown review.

Usage:
    claude-review --pr https://github.com/owner/repo/pull/123 [--output review.md]

Stdlib only. Uses unauthenticated GitHub REST API (60 req/h); set
GITHUB_TOKEN for 5000 req/h.
"""
import argparse
import json
import os
import re
import sys
import urllib.request

API = "https://api.github.com"

RISKY_PATTERNS = [
    (r"\beval\s*\(", "use of `eval()` — arbitrary code execution risk"),
    (r"\bexec\s*\(", "use of `exec()` — arbitrary code execution risk"),
    (r"shell\s*=\s*True", "`shell=True` in subprocess — command injection risk"),
    (r"innerHTML|dangerouslySetInnerHTML", "raw HTML injection — XSS risk"),
    (r"SELECT.*\+|f['\"].*SELECT|query\s*\+\s*", "possible string-built SQL — injection risk"),
    (r"AKIA[0-9A-Z]{16}", "possible hardcoded AWS access key"),
    (r"-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----", "possible committed private key"),
    (r"password\s*=\s*['\"][^'\"]+['\"]", "possible hardcoded password"),
]

TEST_HINT = re.compile(r"(test|spec|__tests__|\.test\.|\.spec\.)", re.I)
LOCKFILE_HINT = re.compile(r"(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|Gemfile\.lock)$")
DOC_HINT = re.compile(r"\.(md|mdx|rst|txt)$|^(docs|README)", re.I)


def api_get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "User-Agent": "claude-review"})
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def parse_pr_url(url):
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)", url.rstrip("/"))
    if not m:
        raise SystemExit(f"error: not a GitHub PR URL: {url}")
    return m.group(1), m.group(2), int(m.group(3))


def summarize(pr, files):
    additions = sum(f.get("additions", 0) for f in files)
    deletions = sum(f.get("deletions", 0) for f in files)
    langs = {}
    for f in files:
        ext = f["filename"].rsplit(".", 1)[-1] if "." in f["filename"] else "(none)"
        langs[ext] = langs.get(ext, 0) + 1
    top = ", ".join(f"{k} x{v}" for k, v in sorted(langs.items(), key=lambda kv: -kv[1])[:5])
    return (f"PR #{pr['number']} “{pr['title']}” by @{pr['user']['login']} touches "
            f"{len(files)} file(s) (+{additions}/-{deletions}). Dominant file types: {top}. "
            f"State: {pr['state']}, mergeable: {pr.get('mergeable_state', 'unknown')}.")


def analyze(files):
    risks, suggestions = [], []
    large = [f["filename"] for f in files if f.get("changes", 0) > 500]
    if large:
        suggestions.append(f"Split or carefully review oversized diffs: {', '.join(large[:5])}.")
    if not any(TEST_HINT.search(f["filename"]) for f in files):
        suggestions.append("No test files touched — add or update tests covering the change.")
    else:
        suggestions.append("Tests are included — ensure they fail without the fix and pass with it.")
    if any(LOCKFILE_HINT.search(f["filename"]) for f in files):
        notes = [f["filename"] for f in files if LOCKFILE_HINT.search(f["filename"])]
        suggestions.append(f"Lockfile churn detected ({', '.join(notes[:3])}) — confirm dependency changes are intentional.")
    if all(DOC_HINT.search(f["filename"]) for f in files):
        suggestions.append("Docs-only change — verify rendered output and links.")
    for f in files:
        patch = f.get("patch", "") or ""
        for line in patch.splitlines():
            if not line.startswith("+") or line.startswith("+++"):
                continue
            for pattern, desc in RISKY_PATTERNS:
                if re.search(pattern, line):
                    risks.append(f"`{f['filename']}`: {desc}.")
    seen, uniq_risks = set(), []
    for r in risks:
        if r not in seen:
            seen.add(r)
            uniq_risks.append(r)
    return uniq_risks, suggestions


def confidence(pr, files, risks):
    score = 2  # Medium default
    if pr.get("mergeable_state") == "clean" and any(TEST_HINT.search(f["filename"]) for f in files):
        score = 3
    if risks or sum(f.get("changes", 0) for f in files) > 2000 or len(files) > 20:
        score = max(1, score - 1)
    return {1: "Low", 2: "Medium", 3: "High"}[score]


def review(pr_url):
    owner, repo, num = parse_pr_url(pr_url)
    pr = api_get(f"{API}/repos/{owner}/{repo}/pulls/{num}")
    files, page = [], 1
    while True:
        batch = api_get(f"{API}/repos/{owner}/{repo}/pulls/{num}/files?per_page=100&page={page}")
        if not batch:
            break
        files.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    risks, suggestions = analyze(files)
    conf = confidence(pr, files, risks)
    risk_lines = [f"- {r}" for r in risks] or ["- None detected by static heuristics — still verify runtime behavior."]
    sugg_lines = [f"- {s}" for s in suggestions] or ["- None."]
    lines = [
        f"# Review: {owner}/{repo}#{num}",
        "",
        "## Summary of changes",
        "",
        summarize(pr, files),
        "",
        "## Identified risks",
        "",
        *risk_lines,
        "",
        "## Improvement suggestions",
        "",
        *sugg_lines,
        "",
        f"**Confidence score: {conf}**",
        "",
        f"_Generated by claude-review for {pr_url}_",
    ]
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Review a GitHub PR and emit structured Markdown.")
    ap.add_argument("--pr", required=True, help="PR URL, e.g. https://github.com/owner/repo/pull/123")
    ap.add_argument("--output", help="Write Markdown to file instead of stdout")
    args = ap.parse_args(argv)
    try:
        md = review(args.pr)
    except Exception as e:  # noqa: BLE001 - surface fetch/parse failures as CLI errors
        print(f"error: {e}", file=sys.stderr)
        return 1
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(md)
    else:
        sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
