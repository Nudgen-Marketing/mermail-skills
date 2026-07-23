#!/usr/bin/env bash
# Build a skills-only ZIP for OpenAI plugin portal Skills upload.
# Portal requires: one skill root OR one directory of skill roots.
# This ZIP places each skill root (folder with SKILL.md) at the archive top level.
# Do not include LICENSE, .codex-plugin, or a wrapping skills/ folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
STAGE="${OUT_DIR}/openai-skills-stage"
ZIP="${OUT_DIR}/mermail-skills-openai.zip"

rm -rf "${STAGE}" "${ZIP}"
mkdir -p "${STAGE}" "${OUT_DIR}"

shopt -s nullglob
for skill_dir in "${ROOT}/skills"/*/; do
  name="$(basename "${skill_dir}")"
  if [[ ! -f "${skill_dir}SKILL.md" ]]; then
    echo "skip ${name}: no SKILL.md" >&2
    continue
  fi
  rsync -a \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    "${skill_dir}" "${STAGE}/${name}/"
done

count="$(find "${STAGE}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [[ "${count}" -lt 1 ]]; then
  echo "No skill roots staged under ${STAGE}" >&2
  exit 1
fi

(
  cd "${STAGE}"
  zip -qr "${ZIP}" .
)

echo "Wrote ${ZIP} (${count} skill roots, $(wc -c < "${ZIP}" | tr -d ' ') bytes)"
