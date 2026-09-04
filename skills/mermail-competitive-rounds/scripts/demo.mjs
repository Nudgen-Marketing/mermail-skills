import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { verifyBundleAt } from "./verify.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const buildScript = join(scriptsDir, "demo", "build-bundle.mjs");

function runNode(script, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

function shortDigest(value) {
  return typeof value === "string" ? value.slice(0, 12) : "unavailable";
}

async function main() {
  const startedAt = performance.now();
  const root = join(tmpdir(), `mermail-competitive-rounds-demo-${randomUUID()}`);
  const build = await runNode(buildScript, [root]);
  if (build.code !== 0) throw new Error(build.stderr || build.stdout || "demo bundle failed");
  const bundle = await readJson(join(root, "authoritative-bundle.json"));
  const summary = await readJson(join(root, "r9-run-summary.json"));
  const verification = await verifyBundleAt(root);
  if (!verification.valid) throw new Error(`valid demo bundle failed verification: ${JSON.stringify(verification)}`);

  const source = bundle.source_evidence;
  const sourceRecord = source.record;
  const sourceSnapshot = source.observation.source_snapshot;
  const exactSpan = sourceSnapshot.content.current_text.slice(sourceRecord.source_span.start, sourceRecord.source_span.end);
  process.stdout.write("Mermail Evidence-Bound Competitive Sourcing Round — local deterministic demo\n");
  process.stdout.write("[POLICY FROZEN] Buyer requirements and eligible suppliers are fixed before interpretation\n");
  process.stdout.write(`[SYNTHETIC HOSTILE FIXTURE] Supplier A prompt injection rejected; trusted canaries=${bundle.r5.hostile_lane.leaked_canaries.length}\n`);
  process.stdout.write(`[EXACT SOURCE VERIFIED | PRESERVED LIVE] Supplier: ${source.supplier_id} | Buyer mailbox receipt: ${source.buyer_email_id} | Field: delivery | Normalized value: ${source.normalized_value.days} days | Exact source span: "${exactSpan}" | Source digest: ${shortDigest(source.source_snapshot_digest)} | Sender auth: ${source.sender_authentication_state}\n`);
  const hardFailSupplier = bundle.r7.decisions.hard_fail.supplier_dispositions.find((item) => item.status === "HARD_CONSTRAINT_FAIL")?.supplier_id ?? "unknown";
  process.stdout.write(`[CHEAPEST / ATTRACTIVE OFFER HARD-FAILS] ${hardFailSupplier}=HARD_CONSTRAINT_FAIL; decision=${bundle.r7.decisions.hard_fail.outcome}\n`);
  process.stdout.write(`[PARETO FRONTIER — HUMAN REVIEW] ${bundle.r7.decisions.frontier.outcome}\n`);
  process.stdout.write(`[NO DEAL — PRIVATE RESERVE WINS] ${bundle.r7.decisions.no_deal.outcome}\n`);
  process.stdout.write(`[LATE REVISION PRESERVED — NOT EFFECTIVE] ${bundle.r7.decisions.final_revision.late_classification.status}\n`);
  process.stdout.write(`[PROCESS TERMINATED] recovery child exit=${summary.r6.fresh_process_exit}\n`);
  process.stdout.write(`[FRESH PROCESS STARTED] durable replay completed without live services\n`);
  process.stdout.write(`[STATE RECOVERED] state digest: ${shortDigest(bundle.r6.state.state_digest)}\n`);
  process.stdout.write(`[APPROVAL MISMATCH — BLOCKED] ${bundle.r8.driftBlocked?.blocked === true}\n`);
  process.stdout.write(`[PRESERVED LIVE EVIDENCE] accepted prior controlled live effect: one effect, no resend; this demo performs no Mermail write\n`);
  process.stdout.write(`[INDEPENDENT VERIFIER — VALID] checks=${verification.checks.length} read_only=${verification.read_only}\n`);

  const tamperedRoot = `${root}-tampered`;
  await fs.cp(root, tamperedRoot, { recursive: true });
  const tamperedPath = join(tamperedRoot, "authoritative-bundle.json");
  const tampered = await readJson(tamperedPath);
  tampered.source_evidence.record.raw_source_fragment = "999 days";
  await fs.writeFile(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
  const tamperedVerification = await verifyBundleAt(tamperedRoot);
  process.stdout.write(`[TAMPERED BUNDLE — REJECTED] valid=${tamperedVerification.valid}\n`);
  if (tamperedVerification.valid) throw new Error("tampered bundle unexpectedly verified");
  process.stdout.write(`DEMO COMPLETE | mechanism_seconds=${((performance.now() - startedAt) / 1000).toFixed(2)} | narration_target=2:20-2:50\n`);
}

await main();
