import { canonicalize } from "./core.mjs";
import { validateEffectIntent } from "./intent.mjs";

export const DEFAULT_FORBIDDEN_EGRESS_TOKENS = Object.freeze([
  "B_PRIVATE_DO_NOT_LEAK",
  "SUPPLIER_B_PRIVATE",
  "SUPPLIER-B-PRIVATE",
  "supplier-b-price",
  "buyer-reserve",
  "BATNA",
  "raw_worker_output",
  "AWARD_APPROVED",
]);

function containsEncodedNeedle(text, needle) {
  const compact = text.replace(/\s+/gu, "").toLowerCase();
  const base64 = Buffer.from(needle, "utf8").toString("base64").toLowerCase();
  const jsonEscaped = [...needle].map((character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`).join("").toLowerCase();
  const canonicalJsonEscapes = compact.replace(/\\\\/gu, "\\");
  return compact.includes(base64) || compact.includes(encodeURIComponent(needle).toLowerCase()) || canonicalJsonEscapes.includes(jsonEscaped);
}

export function checkEgress(intent, { forbiddenTokens = DEFAULT_FORBIDDEN_EGRESS_TOKENS, allowedRecipient = null } = {}) {
  validateEffectIntent(intent);
  const bytes = canonicalize({
    effect_type: intent.effect_type,
    mailbox_id: intent.mailbox_id,
    to: intent.to,
    from: intent.from,
    subject: intent.subject,
    text: intent.text,
    html: intent.html,
    attachments: intent.attachments,
    communication_ref: intent.communication_ref,
  });
  const lower = bytes.toLowerCase();
  const violations = [];
  if (allowedRecipient !== null && intent.to !== allowedRecipient) violations.push({ code: "RECIPIENT_POLICY", field: "to" });
  if (intent.purpose === "AWARD_APPROVED") violations.push({ code: "AWARD_NOT_AUTHORIZED", field: "purpose" });
  for (const token of forbiddenTokens) {
    if (lower.includes(String(token).toLowerCase()) || containsEncodedNeedle(bytes, String(token))) violations.push({ code: "FORBIDDEN_EGRESS_TOKEN", token: String(token) });
  }
  return Object.freeze({ allowed: violations.length === 0, violations, serialized_request_bytes: bytes });
}

export function assertEgress(intent, options = {}) {
  const result = checkEgress(intent, options);
  if (!result.allowed) {
    const error = new Error("outbound effect violates disclosure/effect policy");
    error.code = "EGRESS_FORBIDDEN";
    error.violations = result.violations;
    throw error;
  }
  return result;
}
