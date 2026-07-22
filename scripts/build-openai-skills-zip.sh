#!/usr/bin/env bash
# Build a skills-only ZIP for OpenAI plugin portal upload.
# Portal excludes mcpServers / .app.json / screenshots from skill ZIPs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
STAGE="${OUT_DIR}/openai-skills-stage"
ZIP="${OUT_DIR}/mermail-skills-openai.zip"

rm -rf "${STAGE}" "${ZIP}"
mkdir -p "${STAGE}/.codex-plugin" "${STAGE}/skills" "${OUT_DIR}"

ROOT="${ROOT}" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.env.ROOT;
const src = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"), "utf8"));
delete src.mcpServers;
delete src.apps;
if (src.interface) delete src.interface.screenshots;
writeFileSync(
  join(root, "dist/openai-skills-stage/.codex-plugin/plugin.json"),
  JSON.stringify(src, null, 2) + "\n",
);
NODE

rsync -a --exclude 'node_modules' --exclude '.git' "${ROOT}/skills/" "${STAGE}/skills/"
cp "${ROOT}/LICENSE" "${STAGE}/LICENSE"

(
  cd "${STAGE}"
  zip -qr "${ZIP}" .
)

echo "Wrote ${ZIP} ($(wc -c < "${ZIP}" | tr -d ' ') bytes)"
