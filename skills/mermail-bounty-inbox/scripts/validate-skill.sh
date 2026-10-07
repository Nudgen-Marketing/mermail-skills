#!/usr/bin/env bash
# Local sanity checks for mermail-bounty-inbox (no Mermail credentials required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
test -f "$ROOT/SKILL.md"
NAME="$(awk '/^name:/{print $2; exit}' "$ROOT/SKILL.md")"
test "$NAME" = "mermail-bounty-inbox"
test -f "$ROOT/agents/openai.yaml"
grep -q 'Use \$mermail-bounty-inbox' "$ROOT/agents/openai.yaml"
grep -q 'https://console.mermail.app/mcp' "$ROOT/agents/openai.yaml"
BAD="$(rg -n --glob '*.md' --glob '*.yaml' --glob '*.yml' 'TODO|REPLACE_ME' "$ROOT" || true)"
if [[ -n "$BAD" ]]; then
  echo "$BAD" >&2
  echo "Found unresolved placeholders" >&2
  exit 1
fi
LINES="$(wc -l < "$ROOT/SKILL.md")"
test "$LINES" -le 500
echo "mermail-bounty-inbox local checks OK ($LINES lines)"
