#!/usr/bin/env bash
# Publish all Mermail skills to ClawHub.
# Dry-run by default. Set CLAWHUB_LIVE=1 to upload.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v clawhub >/dev/null 2>&1; then
  echo "clawhub CLI not found. Install with: npm i -g clawhub" >&2
  exit 1
fi

VERSION="${CLAWHUB_VERSION:-$(node -p "require('./package.json').version")}"
OWNER="${CLAWHUB_OWNER:-mermail}"
LIVE="${CLAWHUB_LIVE:-}"

display_name() {
  local slug="$1"
  case "$slug" in
    mermail) echo "Mermail" ;;
    mermail-mcp) echo "Mermail MCP" ;;
    mermail-cli) echo "Mermail CLI" ;;
    mermail-agent-inbox) echo "Mermail Agent Inbox" ;;
    mermail-manage-inbox) echo "Mermail Manage Inbox" ;;
    mermail-compose-email) echo "Mermail Compose Email" ;;
    mermail-administer-workspace) echo "Mermail Administer Workspace" ;;
    mermail-automate-triage) echo "Mermail Automate Triage" ;;
    mermail-mail-agent) echo "Mermail Mail Agent" ;;
    *)
      echo "$slug" | awk -F- '{
        for (i = 1; i <= NF; i++) {
          $i = toupper(substr($i, 1, 1)) substr($i, 2)
        }
        print
      }' OFS=' '
      ;;
  esac
}

echo "Owner:  $OWNER"
echo "Version: $VERSION"
if [[ -n "$LIVE" ]]; then
  echo "Mode:   LIVE publish"
else
  echo "Mode:   dry-run (set CLAWHUB_LIVE=1 to upload)"
fi
echo

failed=0
for d in skills/*/; do
  [[ -f "${d}SKILL.md" ]] || continue
  slug="$(basename "$d")"
  name="$(display_name "$slug")"
  args=(
    skill publish "$d"
    --slug "$slug"
    --name "$name"
    --owner "$OWNER"
    --version "$VERSION"
  )
  if [[ -z "$LIVE" ]]; then
    args+=(--dry-run)
  fi

  echo "==> $slug ($name)"
  if clawhub "${args[@]}"; then
    echo "OK $slug"
  else
    echo "FAIL $slug" >&2
    failed=1
  fi
  echo
done

if [[ "$failed" -ne 0 ]]; then
  echo "One or more publishes failed." >&2
  exit 1
fi

echo "Done. Verify with: clawhub search mermail"
echo "Browse: https://clawhub.ai/"
