#!/usr/bin/env node
// Read-only repository scanner for mermail-deprecation-radar.
// Maps "notice records" extracted from vendor email to concrete code locations.
// No dependencies, no network, never executes repository code, never writes files.
//
// Usage:
//   node scan-repo.mjs --signals notices.json [--root .] [--max-hits 200] [--json]
//   node scan-repo.mjs --self-test
//
// notices.json shape:
// {
//   "notices": [
//     {
//       "id": "jupiter-lite-api",
//       "vendor": "Jupiter",
//       "effective": "2026-10-31",          // ISO date or null when the notice gives none
//       "status": "claimed",                 // claimed | corroborated
//       "signals": [
//         { "type": "literal", "value": "lite-api.jup.ag" },
//         { "type": "regex", "value": "hermes\\.pyth\\.network" },
//         { "type": "package", "value": "@pythnetwork/hermes-client", "below": "2.0.0" }
//       ]
//     }
//   ]
// }

import { readFile, readdir, stat, mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "out", ".next", "target", "vendor", ".venv", "venv", "__pycache__", "coverage", ".turbo", ".cache"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php", ".cs", ".swift", ".toml", ".yaml", ".yml", ".env.example", ".md", ".sh", ".sol", ".move", ".html", ".vue", ".svelte", ".txt", ".cfg", ".ini"]);
const MAX_FILE_BYTES = 1024 * 1024;
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|authorization|bearer|password|private[_-]?key|seed[_-]?phrase|mnemonic)\s*[:=]\s*["'`]?(?:Bearer\s+)?[A-Za-z0-9_\-./+=]{8,}/gi,
  /\b(?:sk|pk|jup|ghp|gho|xox[abp])[_-][A-Za-z0-9_-]{16,}\b/g,
  /\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/g, // base58 blobs that look like Solana secret keys
  /\b0x[0-9a-f]{64}\b/gi,
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const WITHHELD_SNIPPET = "[source snippet withheld; inspect the reported file and line locally]";

function parseArgs(argv) {
  const args = { root: ".", maxHits: 200, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--signals") args.signals = argv[++i];
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--max-hits") args.maxHits = Number(argv[++i]);
    else if (a === "--json") args.json = true;
    else if (a === "--self-test") args.selfTest = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

export function redact(line) {
  // Defense in depth only: arbitrary source snippets are not emitted by scan().
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/i.test(line)) return "[REDACTED: private-key material]";
  let out = line;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.length > 200 ? `${out.slice(0, 197)}...` : out;
}

function isTextFile(file) {
  const base = path.basename(file);
  if (base === "package.json" || base === "Cargo.toml" || base === "requirements.txt" || base === "pyproject.toml" || base === ".env.example") return true;
  return TEXT_EXT.has(path.extname(file).toLowerCase());
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue; // never follow links out of the repo
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && isTextFile(full)) {
      yield full;
    }
  }
}

function compareSemver(pa, pb) {
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function packageRangeEvidence(range, below) {
  const match = typeof range === "string" && range.match(/^(\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const minimum = typeof below === "string" && below.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const safe = (parts) => parts.every(Number.isSafeInteger);
  const lower = match && match.slice(2).map(Number), threshold = minimum && minimum.slice(1).map(Number);
  // A dependency may contain a credentialed URL or arbitrary source material.
  // Only the bounded recognized version grammar may be emitted as evidence.
  if (!match || !safe(lower)) return { range: "[non-version source withheld]", affected: null, comparison: "unknown-specifier" };
  if (!minimum || !safe(threshold)) return { range, affected: null, comparison: "unknown-threshold" };
  if (compareSemver(lower, threshold) >= 0) return { range, affected: false, comparison: "supported-range-not-below-threshold" };
  if (!match[1]) return { range, affected: true, comparison: "exact-declared-version-below-threshold" };
  const upper = match[1] === "~" ? [lower[0], lower[1] + 1, 0]
    : lower[0] > 0 ? [lower[0] + 1, 0, 0]
      : lower[1] > 0 ? [0, lower[1] + 1, 0] : [0, 0, lower[2] + 1];
  if (!safe(upper)) return { range, affected: null, comparison: "unknown-range-bound" };
  return compareSemver(upper, threshold) <= 0
    ? { range, affected: true, comparison: "supported-range-entirely-below-threshold" }
    : { range, affected: null, comparison: "range-crosses-threshold-check-resolved-version" };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A deliberately small, bounded-backtracking subset, not a JavaScript-regex
// sandbox. Literal/package signals remain the preferred deprecation matchers.
// One optional atom is allowed anywhere. A single repeated atom requires a
// start anchor; groups, alternatives, backreferences and nested/lazy repeats
// are rejected before RegExp is constructed or repository text is processed.
export function validateRegexPattern(value) {
  if (typeof value !== "string" || !value.length || value.length > 200) throw new Error("regex signal must contain 1–200 characters");
  const anchored = value.startsWith("^");
  let i = anchored ? 1 : 0;
  let quantifiers = 0;
  const unsupported = () => { throw new Error("unsupported regex shape: use literal signals or an anchored pattern with one repeated atom; groups, alternatives and backreferences are not supported"); };
  function escaped() {
    i += 1;
    if (i >= value.length || !/[dDsSwWbBtrnfv\\/.$^\[\]{}()*+?|\-]/.test(value[i])) unsupported();
    i += 1;
  }
  while (i < value.length) {
    if (value[i] === "$" && i === value.length - 1) { i += 1; continue; }
    if (value[i] === "\\") escaped();
    else if (value[i] === "[") {
      i += 1;
      if (value[i] === "^") i += 1;
      const start = i;
      while (i < value.length && value[i] !== "]") {
        if (value[i] === "\\") escaped();
        else i += 1;
      }
      if (i === start || i >= value.length) unsupported();
      i += 1;
    } else {
      if (/[()|{}*+?^$]/.test(value[i])) unsupported();
      i += 1;
    }
    const quantifier = value[i];
    if (quantifier === "?" || quantifier === "*" || quantifier === "+" || quantifier === "{") {
      quantifiers += 1;
      if (quantifiers > 1 || (quantifier !== "?" && !anchored)) unsupported();
      if (quantifier === "{") {
        const match = value.slice(i).match(/^\{(\d+)(?:,(\d*))?\}/);
        if (!match) unsupported();
        const minimum = Number(match[1]);
        const maximum = match[2] === undefined ? minimum : match[2] === "" ? Infinity : Number(match[2]);
        if (minimum > 1000 || maximum < minimum || (maximum !== Infinity && maximum > 1000)) unsupported();
        i += match[0].length;
      } else i += 1;
    }
  }
  return true;
}

function compileSignal(signal) {
  if (!signal || typeof signal.value !== "string" || !signal.value.length) throw new Error("signal value must be a non-empty string");
  if (signal.type === "literal") return new RegExp(escapeRegex(signal.value), "g");
  if (signal.type === "regex") {
    validateRegexPattern(signal.value);
    return new RegExp(signal.value, "g");
  }
  if (signal.type === "package") return new RegExp(`["'\`]${escapeRegex(signal.value)}["'\`/]`, "g");
  throw new Error(`unsupported signal type ${signal.type}`);
}

export function urgency(effective, today = new Date()) {
  if (typeof effective !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effective)) return "unknown-date";
  const parsed = new Date(`${effective}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== effective) return "unknown-date";
  const days = Math.floor((parsed - today) / 86400000);
  if (Number.isNaN(days)) return "unknown-date";
  if (days < 0) return "past-due";
  if (days <= 14) return "due-within-14-days";
  if (days <= 60) return "due-within-60-days";
  return "later";
}

export async function scan(root, notices, maxHits = 200, today = new Date()) {
  if (!Number.isSafeInteger(maxHits) || maxHits < 1 || maxHits > 10000) throw new Error("max-hits must be an integer from1 to10000");
  if (!Array.isArray(notices) || notices.length > 100) throw new Error("notices must be an array with at most100 records");
  const compiled = notices.map((n) => ({
    notice: n,
    signals: (n.signals ?? []).map((s) => ({ signal: s, re: compileSignal(s) })),
    hits: [],
    packageFindings: [],
  }));
  let total = 0;
  let filesScanned = 0;
  for await (const file of walk(root)) {
    const info = await stat(file);
    if (info.size > MAX_FILE_BYTES) continue;
    filesScanned += 1;
    const text = await readFile(file, "utf8");
    const rel = path.relative(root, file);
    const lines = text.split(/\r?\n/);
    if (path.basename(file) === "package.json") {
      let pkg = null;
      try { pkg = JSON.parse(text); } catch { pkg = null; }
      if (pkg) {
        for (const c of compiled) {
          for (const { signal } of c.signals) {
            if (signal.type !== "package") continue;
            for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
              const range = pkg[field]?.[signal.value];
              if (!range) continue;
              const evidence = packageRangeEvidence(range, signal.below);
              c.packageFindings.push({ file: rel, field, package: signal.value, ...evidence, below: signal.below ?? null });
            }
          }
        }
      }
    }
    for (let i = 0; i < lines.length; i += 1) {
      for (const c of compiled) {
        for (const { signal, re } of c.signals) {
          re.lastIndex = 0;
          if (!re.test(lines[i])) continue;
          if (total >= maxHits) continue;
          // A heuristic cannot prove that arbitrary source is secret-free.
          // Preserve exact navigation/matching evidence without echoing it.
          c.hits.push({ file: rel, line: i + 1, signal: signal.value, text: WITHHELD_SNIPPET, snippet_status: "withheld" });
          total += 1;
        }
      }
    }
  }
  return {
    root: path.resolve(root),
    filesScanned,
    truncated: total >= maxHits,
    coverage: total >= maxHits ? "limited-hit-cap" : "reviewed-text-files-only",
    notices: compiled
      .map((c) => ({
        id: c.notice.id,
        vendor: c.notice.vendor ?? null,
        effective: c.notice.effective ?? null,
        status: c.notice.status ?? "claimed",
        urgency: urgency(c.notice.effective, today),
        hitCount: c.hits.length,
        files: [...new Set(c.hits.map((h) => h.file))].length,
        packageFindings: c.packageFindings,
        hits: c.hits,
      }))
      .sort((a, b) => order(a.urgency) - order(b.urgency) || b.hitCount - a.hitCount),
  };
}

function order(u) {
  return ["past-due", "due-within-14-days", "due-within-60-days", "later", "unknown-date"].indexOf(u);
}

function printHuman(result) {
  console.log(`Scanned ${result.filesScanned} files under ${result.root}${result.truncated ? " (hit cap reached; results truncated)" : ""}`);
  for (const n of result.notices) {
    console.log(`\n[${n.urgency}] ${n.vendor ?? n.id} (${n.id}) effective=${n.effective ?? "unknown"} status=${n.status}`);
    if (!n.hitCount && !n.packageFindings.length) {
      console.log(result.truncated ? "  no recorded hits in incomplete scan; absence not established" : "  no recorded references in reviewed text files; excluded or unread files are not covered");
      continue;
    }
    for (const p of n.packageFindings) {
      console.log(`  package ${p.package}@${p.range} in ${p.file} (${p.field})${p.below ? ` affected-below-${p.below}=${p.affected}` : ""}`);
    }
    for (const h of n.hits) console.log(`  ${h.file}:${h.line}  [${h.signal}]  ${h.text}`);
  }
}

async function selfTest() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "deprecation-radar-"));
  try {
    await mkdir(path.join(dir, "src"));
    await mkdir(path.join(dir, "node_modules", "x"), { recursive: true });
    await writeFile(path.join(dir, "src", "price.ts"), [
      'const BASE = "https://lite-api.jup.ag/price/v3";',
      'const HERMES = "https://hermes.pyth.network/v2/updates/price/latest";',
      'const apiKey = "jup_abcdefghijklmnopqrstuvwxyz123456";',
    ].join("\n"));
    await writeFile(path.join(dir, "node_modules", "x", "index.js"), 'fetch("https://lite-api.jup.ag/x")');
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { "@pythnetwork/hermes-client": "^1.3.0" } }));
    const result = await scan(dir, [
      { id: "jup", vendor: "Jupiter", effective: "2026-01-01", signals: [{ type: "literal", value: "lite-api.jup.ag" }] },
      { id: "pyth", vendor: "Pyth", effective: null, signals: [{ type: "literal", value: "hermes.pyth.network" }, { type: "package", value: "@pythnetwork/hermes-client", below: "2.0.0" }] },
      { id: "none", vendor: "Nobody", effective: "2099-01-01", signals: [{ type: "literal", value: "api.example.invalid" }] },
      { id: "secret", vendor: "Secret", effective: null, signals: [{ type: "literal", value: "apiKey" }] },
    ], 50, new Date("2026-10-04T00:00:00Z"));
    const by = Object.fromEntries(result.notices.map((n) => [n.id, n]));
    const checks = [
      ["skips node_modules", by.jup.hitCount === 1],
      ["past-due urgency", by.jup.urgency === "past-due"],
      ["unknown date urgency", by.pyth.urgency === "unknown-date"],
      ["package range flagged", by.pyth.packageFindings.length === 1 && by.pyth.packageFindings[0].affected === true],
      ["zero-hit notice reported", by.none.hitCount === 0 && by.none.urgency === "later"],
      ["secret redacted", by.secret.hits.length === 1 && !by.secret.hits[0].text.includes("abcdefghijklmnop")],
      ["sorted by urgency", result.notices[0].id === "jup"],
    ];
    let failed = 0;
    for (const [name, ok] of checks) {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
      if (!ok) failed += 1;
    }
    if (failed) process.exit(1);
    console.log(`self-test passed (${checks.length} checks)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    await selfTest();
  } else {
    if (!args.signals) throw new Error("--signals is required");
    const parsed = JSON.parse(await readFile(args.signals, "utf8"));
    const result = await scan(args.root, parsed.notices ?? [], args.maxHits);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
