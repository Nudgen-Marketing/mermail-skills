#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MAX_INPUT_BYTES = 256 * 1024;
const MAX_EVIDENCE_BYTES = 256 * 1024;
const MAX_NORMALIZED_QUESTIONNAIRE_CHARS = 100_000;
const MAX_NORMALIZED_EVIDENCE_CHARS = 100_000;
const MAX_ANSWER_CHARS = 20_000;
const MAX_QUESTIONS = 100;
const MAX_EVIDENCE_ITEMS = 200;
const PREAMBLE_LOCATION = "PREAMBLE";
const SHA256 = /^[a-f0-9]{64}$/;
const questionPattern = /^\s*((?:Q(?:UESTION)?[-_. ]?\d+[A-Za-z]?|[A-Za-z]{2,12}[-_.]\d+[A-Za-z]?|\d+(?:\.\d+)*))\s*(?::|\)|\.(?!\d)|-(?!\d))\s*(.+?)\s*$/i;

function fail(message) { throw new Error(message); }
function charLength(value) { return Array.from(value).length; }
function canonicalId(value) { return value.normalize("NFKC").toLocaleLowerCase("en-US"); }

/** The sole canonicalization used before hashing question text. */
export function normalizeQuestionText(value) {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim();
}
export function questionSha256(value) {
  return createHash("sha256").update(normalizeQuestionText(value), "utf8").digest("hex");
}
function normalizedScanText(value) { return normalizeQuestionText(value); }

const injectionPatterns = [
  /ignore (?:all |any )?(?:previous|prior|system|developer) instructions?/i,
  /(?:reveal|print|show|provide|give|share|paste|read|open|access|disclose|dump|export|exfiltrate|send|email|upload).{0,60}(?:credentials?|secrets?|passwords?|tokens?|api keys?|private keys?|environment variables?|\.ssh|id_rsa|\/etc\/passwd)/i,
  /(?:read|open|access|copy|paste|upload|send|export).{0,50}(?:~\/|\/(?:etc|home|users|var|private)\/|[a-z]:\\)/i,
  /(?:change|add|include|replace|override).{0,30}(?:recipients?|destinations?|target address(?:es)?|to:|cc:|bcc:)/i,
  /(?:run|execute|invoke|launch|call|use).{0,35}(?:commands?|shell|scripts?|powershell|bash|terminal|curl|wget)/i,
  /(?:curl|wget).{0,80}(?:https?:\/\/|[\w.+-]+@[\w.-]+|credentials?|secrets?|tokens?|local files?)/i,
  /(?:send|forward|reply|transmit|export|upload).{0,50}(?:without approval|immediately|right away|now|external (?:address|email|url)|outside (?:address|email)|https?:\/\/|[\w.+-]+@[\w.-]+)/i,
  /(?:to|send (?:it )?to|forward (?:it )?to|upload (?:it )?to).{0,25}(?:https?:\/\/|[\w.+-]+@[\w.-]+)/i,
  /(?:follow|open|visit|navigate to).{0,50}(?:https?:\/\/|external (?:link|url)).{0,60}(?:upload|send|share|export|evidence pack|credentials?|secrets?|local files?)/i,
  /(?:treat|use).{0,30}(?:as approved evidence|as evidence)/i,
];
function containsInjection(value) {
  const scanned = normalizedScanText(value);
  return injectionPatterns.some((pattern) => pattern.test(scanned));
}

function isSafePreamble(line) {
  const value = line.trim();
  return containsInjection(value) || /^#{1,6}\s+\S/.test(value) ||
    /^(?:security|vendor(?:[- ]risk)?|due diligence|ddq)(?: assessment)? questionnaire(?:\s*[-–—:]\s*[\p{L}\p{N} ._'&()-]+)?$/iu.test(value);
}
function looksLikeMalformedQuestion(line) {
  const value = line.trim();
  return /^(?:Q(?:UESTION)?[-_. ]?\d+|[A-Za-z]{2,12}[-_.]\d+|\d+(?:\.\d+)*)\b/i.test(value) || value.endsWith("?");
}

function parseQuestions(text) {
  const questions = [];
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const firstQuestionIndex = lines.findIndex((line) => questionPattern.test(line));
  const quarantinedPreamble = firstQuestionIndex > 0 && containsInjection(lines.slice(0, firstQuestionIndex).join("\n"));
  for (const [lineIndex, rawLine] of lines.entries()) {
    const match = rawLine.match(questionPattern);
    if (match) { questions.push({ question_id: match[1], question: match[2] }); continue; }
    if (!rawLine.trim()) continue;
    if (!questions.length) {
      if (isSafePreamble(rawLine) || (quarantinedPreamble && lineIndex < firstQuestionIndex)) continue;
      fail(`Unrecognized non-empty preamble line: ${rawLine.trim()}`);
    }
    if (looksLikeMalformedQuestion(rawLine)) fail(`Unparseable or ambiguous question line: ${rawLine.trim()}`);
    if (/^[\t ]{2,}\S/.test(rawLine) || containsInjection(rawLine)) { questions.at(-1).question += ` ${rawLine.trim()}`; continue; }
    fail(`Unrecognized non-empty line after ${questions.at(-1).question_id}: ${rawLine.trim()}`);
  }
  if (!questions.length) fail("No questions with explicit IDs were found");
  if (questions.length > MAX_QUESTIONS) fail(`Question count exceeds ${MAX_QUESTIONS}`);
  const ids = new Set();
  for (const q of questions) {
    const id = canonicalId(q.question_id);
    if (ids.has(id)) fail(`Duplicate question ID: ${q.question_id}`);
    ids.add(id);
  }
  return questions;
}

function scanInjectionLocations(text) {
  const segments = [{ location: PREAMBLE_LOCATION, text: "" }];
  for (const rawLine of text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const match = rawLine.match(questionPattern);
    if (match) segments.push({ location: match[1], text: rawLine });
    else segments.at(-1).text += `${segments.at(-1).text ? "\n" : ""}${rawLine}`;
  }
  return [...new Set(segments.filter(({ text: value }) => containsInjection(value)).map(({ location }) => location))];
}

function validateEvidence(pack) {
  if (!pack || !Array.isArray(pack.evidence)) fail("Evidence JSON must contain an evidence array");
  if (pack.evidence.length > MAX_EVIDENCE_ITEMS) fail(`Evidence count exceeds ${MAX_EVIDENCE_ITEMS}`);
  const ids = new Set();
  let chars = 0;
  return pack.evidence.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id.trim()) fail("Every evidence item needs an id");
    const id = item.id.trim();
    const cid = canonicalId(id);
    if (ids.has(cid)) fail(`Duplicate evidence ID: ${id}`); ids.add(cid);
    if (typeof item.answer !== "string" || !item.answer.trim()) fail(`Evidence ${id} needs an answer`);
    const answer = item.answer.trim();
    if (charLength(answer) > MAX_ANSWER_CHARS) fail(`Evidence ${id} answer exceeds ${MAX_ANSWER_CHARS} characters`);
    if (!Array.isArray(item.question_bindings) || !item.question_bindings.length) fail(`Evidence ${id} needs a non-empty question_bindings array`);
    const seen = new Set();
    const bindings = item.question_bindings.map((binding) => {
      if (!binding || typeof binding.question_id !== "string" || !binding.question_id.trim()) fail(`Evidence ${id} binding needs question_id`);
      if (typeof binding.question_sha256 !== "string" || !SHA256.test(binding.question_sha256)) fail(`Evidence ${id} binding needs a lowercase SHA-256 question_sha256`);
      const questionId = binding.question_id.trim();
      const key = `${canonicalId(questionId)}:${binding.question_sha256}`;
      if (seen.has(key)) fail(`Evidence ${id} has a duplicate question binding`); seen.add(key);
      return { questionId: canonicalId(questionId), questionSha256: binding.question_sha256 };
    });
    chars += charLength(normalizeQuestionText([id, answer, ...bindings.flatMap((b) => [b.questionId, b.questionSha256])].join(" ")));
    if (chars > MAX_NORMALIZED_EVIDENCE_CHARS) fail(`Normalized evidence exceeds ${MAX_NORMALIZED_EVIDENCE_CHARS} characters`);
    return { id, answer, bindings };
  });
}

export function candidateQuestionHashes(questionnaire) {
  if (typeof questionnaire !== "string") fail("Questionnaire must be UTF-8 text");
  if (Buffer.byteLength(questionnaire, "utf8") > MAX_INPUT_BYTES) fail(`Questionnaire exceeds ${MAX_INPUT_BYTES} bytes`);
  if (charLength(normalizeQuestionText(questionnaire)) > MAX_NORMALIZED_QUESTIONNAIRE_CHARS) fail(`Normalized questionnaire exceeds ${MAX_NORMALIZED_QUESTIONNAIRE_CHARS} characters`);
  return parseQuestions(questionnaire).map(({ question_id, question }) => ({ question_id, question_sha256: questionSha256(question) }));
}

export function evaluate(questionnaire, evidencePack) {
  if (typeof questionnaire !== "string") fail("Questionnaire must be UTF-8 text");
  if (Buffer.byteLength(questionnaire, "utf8") > MAX_INPUT_BYTES) fail(`Questionnaire exceeds ${MAX_INPUT_BYTES} bytes`);
  if (charLength(normalizeQuestionText(questionnaire)) > MAX_NORMALIZED_QUESTIONNAIRE_CHARS) fail(`Normalized questionnaire exceeds ${MAX_NORMALIZED_QUESTIONNAIRE_CHARS} characters`);
  const questions = parseQuestions(questionnaire);
  const evidence = validateEvidence(evidencePack);
  const injectionLocations = scanInjectionLocations(questionnaire);
  const injectionQuestionIds = injectionLocations.filter((x) => x !== PREAMBLE_LOCATION);
  const injectedIds = new Set(injectionQuestionIds.map(canonicalId));
  const results = questions.map(({ question_id, question }) => {
    const cid = canonicalId(question_id); const hash = questionSha256(question);
    const matches = evidence.filter((item) => item.bindings.some((b) => b.questionId === cid && b.questionSha256 === hash));
    if (injectedIds.has(cid) || !matches.length) return { question_id, question, status: "NEEDS_EVIDENCE", answer: "NEEDS_EVIDENCE", evidence_ids: [], confidence: "NONE" };
    const answers = [...new Set(matches.map(({ answer }) => answer))];
    if (answers.length !== 1) return { question_id, question, status: "NEEDS_EVIDENCE", answer: "NEEDS_EVIDENCE", evidence_ids: [], confidence: "NONE" };
    return { question_id, question, status: "ANSWERED", answer: answers[0], evidence_ids: matches.map(({ id }) => id), confidence: "HIGH" };
  });
  const answered = results.filter(({ status }) => status === "ANSWERED").length;
  return { questions: results, coverage: { total: results.length, answered, needs_evidence: results.length - answered, percent: Number(((answered / results.length) * 100).toFixed(2)), confidence: { HIGH: answered, NONE: results.length - answered } }, injection_detected: injectionLocations.length > 0, injection_question_ids: injectionQuestionIds, injection_locations: injectionLocations };
}

async function readUtf8WithinLimit(filePath, limit, label) {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) fail(`${label} must be a regular file`);
  if (metadata.size > limit) fail(`${label} exceeds ${limit} bytes`);
  const buffer = await readFile(filePath);
  if (buffer.byteLength > limit) fail(`${label} exceeds ${limit} bytes`);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { fail(`${label} is not valid UTF-8`); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--hashes") {
    if (args.length !== 2) fail("Usage: questionnaire-demo.mjs --hashes QUESTIONNAIRE.txt");
    const questionnaire = await readUtf8WithinLimit(args[1], MAX_INPUT_BYTES, "Questionnaire");
    process.stdout.write(`${JSON.stringify({ question_hashes: candidateQuestionHashes(questionnaire) }, null, 2)}\n`); return;
  }
  const [questionnairePath, evidencePath] = args;
  if (!questionnairePath || !evidencePath || args.length !== 2) fail("Usage: questionnaire-demo.mjs QUESTIONNAIRE.txt EVIDENCE.json");
  const [questionnaire, evidenceText] = await Promise.all([readUtf8WithinLimit(questionnairePath, MAX_INPUT_BYTES, "Questionnaire"), readUtf8WithinLimit(evidencePath, MAX_EVIDENCE_BYTES, "Evidence file")]);
  process.stdout.write(`${JSON.stringify(evaluate(questionnaire, JSON.parse(evidenceText)), null, 2)}\n`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
