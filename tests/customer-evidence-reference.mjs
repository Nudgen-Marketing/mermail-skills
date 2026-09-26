import { readFile } from "node:fs/promises";
import path from "node:path";

const BANDS = new Set(["strong", "moderate", "weak", "insufficient"]);
const EVIDENCE_KINDS = new Set([
  "customer_statement",
  "observed_behavior",
  "owner_record",
  "analyst_inference",
]);

function distinct(values) {
  return new Set(values.filter((value) => typeof value === "string" && value.length > 0));
}

export function evaluateCustomerEvidenceCase(referenceCase) {
  const uniqueItems = new Map();
  for (const item of referenceCase.items) {
    if (!uniqueItems.has(item.evidence_id)) uniqueItems.set(item.evidence_id, item);
  }
  const items = [...uniqueItems.values()];
  const verifiedAccounts = distinct(
    items
      .filter((item) => item.account_mapping_verified === true)
      .map((item) => item.account_id),
  );
  const messageCount = distinct(
    items
      .filter((item) => item.source_kind !== "owner_record")
      .flatMap((item) => item.message_ids ?? [item.message_id]),
  ).size;
  const threadCount = distinct(items.map((item) => item.thread_id)).size;
  const supportedPoint = items.some((item) => item.concrete === true || item.reproducible === true);
  const reproducibleBehavior = items.some(
    (item) => item.source_kind === "observed_behavior" && item.reproducible === true,
  );
  const materialCounterevidence = items.some((item) => item.material_counterevidence === true);

  let existenceBand = "weak";
  let prevalenceBand = "weak";
  if (referenceCase.source_safe !== true || items.length === 0) {
    existenceBand = "insufficient";
    prevalenceBand = "insufficient";
  } else {
    const canBeStrong = verifiedAccounts.size >= 3 && supportedPoint && !materialCounterevidence;
    if (canBeStrong) {
      existenceBand = "strong";
      prevalenceBand = "strong";
    } else {
      if (
        (verifiedAccounts.size >= 2 && supportedPoint) ||
        reproducibleBehavior
      ) {
        existenceBand = "moderate";
      }
      if (verifiedAccounts.size >= 2 && supportedPoint) prevalenceBand = "moderate";
    }
  }

  return {
    message_count: messageCount,
    thread_count: threadCount,
    verified_account_count: verifiedAccounts.size,
    existence_band: existenceBand,
    prevalence_band: prevalenceBand,
    revenue_status: "not_verified_from_mailbox_evidence",
  };
}

export async function validateCustomerEvidenceReference(root) {
  const errors = [];
  const fixturePath = path.join(root, "tests", "fixtures", "customer-evidence-reference.json");
  let corpus;
  try {
    corpus = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch (error) {
    return [`customer-evidence: cannot load synthetic reference set: ${error.message}`];
  }

  const notice = corpus.notice?.toLowerCase() ?? "";
  if (!notice.includes("synthetic") || !notice.includes("execute a model")) {
    errors.push("customer-evidence: reference set must identify synthetic data and its model-execution limit");
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length < 5) {
    errors.push("customer-evidence: reference set needs at least five cases");
    return errors;
  }

  const caseIds = new Set();
  for (const referenceCase of corpus.cases) {
    if (!referenceCase.id || caseIds.has(referenceCase.id)) {
      errors.push("customer-evidence: reference case IDs must be present and unique");
      continue;
    }
    caseIds.add(referenceCase.id);
    if (!Array.isArray(referenceCase.items) || !referenceCase.expected) {
      errors.push(`customer-evidence: ${referenceCase.id} needs evidence items and expected output`);
      continue;
    }
    for (const item of referenceCase.items) {
      if (!item.evidence_id || !EVIDENCE_KINDS.has(item.source_kind)) {
        errors.push(`customer-evidence: ${referenceCase.id} has an incomplete evidence record`);
      }
      const messageIds = item.message_ids ?? (item.message_id ? [item.message_id] : []);
      if (item.source_kind !== "owner_record" && (messageIds.length === 0 || !item.thread_id)) {
        errors.push(`customer-evidence: ${referenceCase.id} needs a message and thread source for mail evidence`);
      }
      if (item.account_mapping_verified === true && !item.account_id) {
        errors.push(`customer-evidence: ${referenceCase.id} marks an account mapping verified without an account key`);
      }
    }
    const actual = evaluateCustomerEvidenceCase(referenceCase);
    for (const [key, value] of Object.entries(referenceCase.expected)) {
      if (actual[key] !== value) {
        errors.push(`customer-evidence: ${referenceCase.id} expected ${key}=${value}, got ${actual[key]}`);
      }
    }
    for (const band of [actual.existence_band, actual.prevalence_band]) {
      if (!BANDS.has(band)) errors.push(`customer-evidence: ${referenceCase.id} produced an invalid evidence band`);
    }
  }

  for (const required of [
    "message-inflation",
    "independent-accounts",
    "counterevidence",
    "reproducible-defect",
    "revenue-claim",
    "unsafe-source",
  ]) {
    if (!caseIds.has(required)) errors.push(`customer-evidence: missing reference case ${required}`);
  }

  const method = await readFile(
    path.join(root, "skills", "mermail-customer-evidence", "references", "method.md"),
    "utf8",
  );
  const skill = await readFile(path.join(root, "skills", "mermail-customer-evidence", "SKILL.md"), "utf8");
  const writtenRules = `${method}\n${skill}`;
  for (const rule of [
    "Message count measures activity. It does not measure customers",
    "Without an owner-verified account mapping, cap a prevalence or demand claim at **weak**",
    "A single reproducible defect may support the separate claim that the defect exists at **moderate**",
    "Do not call an email claim, screenshot, price, invoice, balance, or configured plan verified revenue",
  ]) {
    if (!writtenRules.includes(rule)) errors.push(`customer-evidence: skill references no longer state reference rule: ${rule}`);
  }
  return errors;
}
