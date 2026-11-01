#!/usr/bin/env bash
# Stage only Antigravity components; other clients' manifests trigger strict warnings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
STAGE="${OUT_DIR}/antigravity/mermail"
ZIP="${OUT_DIR}/mermail-antigravity.zip"

command -v agy >/dev/null || { echo "Install the current Antigravity CLI first." >&2; exit 1; }
mkdir -p "${OUT_DIR}"
rm -rf "${STAGE}"
rm -f "${ZIP}"
mkdir -p "${STAGE}/assets"

cp "${ROOT}/.antigravity-plugin/plugin.json" "${STAGE}/plugin.json"
cp "${ROOT}/.antigravity-plugin/README.md" "${STAGE}/README.md"
cp "${ROOT}/mcp_config.json" "${ROOT}/LICENSE" "${STAGE}/"
cp "${ROOT}/assets/logo.svg" "${STAGE}/assets/logo.svg"
rsync -a --exclude '.DS_Store' --exclude 'node_modules' --exclude '__pycache__' \
  "${ROOT}/skills/" "${STAGE}/skills/"

# Never publish an archive containing truncated or undiscoverable components.
agy plugin validate --strict "${STAGE}"
(
  cd "${STAGE}"
  zip -qr "${ZIP}" .
)
unzip -tqq "${ZIP}"
echo "Wrote ${ZIP}"
