#!/usr/bin/env node
// mermail-email-e2e runner: trigger your app's email flows, catch the mail in a Mermail inbox,
// assert on it, follow allowlisted links, and write Markdown / JSON / JUnit reports.
//
//   MERMAIL_API_KEY=… node run-email-e2e.mjs --spec .mermail/email-e2e.json [--flow id] [--report-dir dir]
//
// Zero dependencies (Node 22+). Talks to the hosted Mermail MCP server over Streamable HTTP and only
// calls read tools: list_mailboxes, list_emails, search_emails, get_email. It never sends email.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  STATUS,
  deliveryReceiptCheck,
  hostAllowed,
  htmlToText,
  isDeliveryTerminal,
  isLocalHost,
  jsonSubsetMatches,
  normalizeAddress,
  normalizeMessage,
  parseUrl,
  redactUrl,
  runMessageChecks,
  summarize,
  toRegExp,
} from "./checks.mjs";

const VERSION = "1.0.0";
const args = parseArgs(process.argv.slice(2));
if (args.help) usage(0);

const endpoint = process.env.MERMAIL_MCP_URL || "https://console.mermail.app/mcp";
const apiKey = process.env.MERMAIL_API_KEY;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const ICON = { pass: c(32, "✔"), warn: c(33, "▲"), fail: c(31, "✖"), info: c(36, "ℹ"), skip: c(90, "○") };

const specPath = path.resolve(args.spec ?? ".mermail/email-e2e.json");
const spec = await loadSpec(specPath);
const reportDir = path.resolve(args["report-dir"] ?? spec.reportDir ?? "email-e2e-report");
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(2, 12) + Math.random().toString(36).slice(2, 5);

if (!apiKey) die("MERMAIL_API_KEY is not set in this process environment. Export it from your secret store; never paste it into chat.");
if (!apiKey.startsWith(["sk", "proj"].join("-") + "-")) die("MERMAIL_API_KEY has an unexpected format (expected a workspace project key).");

const mcp = createMcpClient({ endpoint, apiKey, rpm: Number(args.rpm ?? spec.rateLimitRpm ?? 6) });
const startedAt = new Date();
log(`\n${c(1, "mermail-email-e2e")} ${c(90, `v${VERSION} · run ${runId} · ${path.relative(process.cwd(), specPath)}`)}`);

// 1. Resolve the test mailbox. The runner never provisions; the skill does that with user approval.
const mailbox = await resolveMailbox(spec.mailbox);
log(`${c(90, "mailbox")}  ${mailbox.email} ${c(90, `(${mailbox.public_id})`)}`);

const selected = spec.flows.filter((f) => !args.flow || [].concat(args.flow).includes(f.id));
if (!selected.length) die(`No flows matched ${[].concat(args.flow).join(", ")}.`);
if (args["dry-run"]) {
  log(`${ICON.pass} spec valid, Mermail reachable, ${selected.length} flow(s): ${selected.map((f) => f.id).join(", ")}`);
  process.exit(0);
}

const flowResults = [];
for (const [index, flow] of selected.entries()) flowResults.push(await runFlow(flow, index));

const report = buildReport(flowResults);
await writeReports(report);
printSummary(report);
process.exit(report.summary.fail ? 1 : 0);

// ---------------------------------------------------------------------------------------------

async function runFlow(flow, index) {
  const t = { flow: flow.id, title: flow.title ?? flow.id, checks: [], timings: {}, state: "running" };
  const address = flowAddress(flow, index);
  const vars = { ...spec.vars, ...flow.vars, address, mailbox: mailbox.email, appBaseUrl: spec.appBaseUrl ?? "", runId, flowId: flow.id };
  const expect = substitute(flow.expect ?? {}, vars);
  const capture = flow.capture ?? spec.capture ?? "inbox"; // "inbox": a separate test inbox receives it; "sent": the app sends through this mailbox
  const folder = capture === "sent" ? "sent" : "inbox";
  const ctx = { linkHosts: spec.linkHosts ?? [], mode: spec.mode ?? "dev", kind: flow.kind ?? "transactional", capture };
  const timeoutSec = flow.timeoutSec ?? spec.defaults?.timeoutSec ?? 120;
  const pollSec = Math.max(Number(process.env.MERMAIL_E2E_MIN_POLL_SEC ?? 5), flow.pollSec ?? spec.defaults?.pollSec ?? 8);
  const maxLatencySec = expect.maxLatencySec ?? spec.defaults?.maxLatencySec ?? 30;

  log(`\n${c(1, `▶ ${t.title}`)} ${c(90, `[${flow.id}] → ${address} · capture ${folder}`)}`);

  // 2. Baseline: ids already in the folder are never candidates.
  const baseline = new Set((await listRecent(mailbox.public_id, folder)).map((e) => e.id));
  step(`baseline recorded: ${baseline.size} existing message id(s)`);

  // 3. Trigger the flow in the app under test.
  const triggeredAt = new Date();
  const windowStart = new Date(triggeredAt.getTime() - 60_000).toISOString(); // tolerate clock skew
  try {
    const out = await runAction(flow.trigger, vars, { strict: true });
    step(`trigger ${describeAction(flow.trigger, vars)} ${c(90, out.summary)}`);
  } catch (error) {
    t.checks.push({ id: "TRG-001", title: "Trigger succeeded", status: STATUS.FAIL, detail: error.message });
    t.state = "blocked";
    log(`  ${ICON.fail} trigger failed: ${error.message}`);
    return t;
  }

  // 4. Bounded wait for exactly one new message to this address.
  const deadline = triggeredAt.getTime() + timeoutSec * 1000;
  let candidates = [];
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    candidates = await findCandidates({ address, expect, windowStart, baseline, folder });
    step(`poll ${attempts}: ${candidates.length} candidate(s) ${c(90, `${((Date.now() - triggeredAt) / 1000).toFixed(1)}s`)}`, true);
    if (candidates.length) break;
    await sleep(Math.min(pollSec * 1000, Math.max(0, deadline - Date.now())));
  }
  const detectedAt = new Date();
  if (color) process.stdout.write("\n");

  if (!candidates.length) {
    const where = folder === "sent" ? "in Sent (did the app call Mermail?)" : "in the Inbox (possible hold, send failure, or wrong recipient)";
    t.checks.push({ id: "DLV-001", title: "Email delivered", status: STATUS.FAIL, detail: `nothing to ${address} ${where} within ${timeoutSec}s (${attempts} polls)` });
    t.state = "timed_out";
    log(`  ${ICON.fail} timed out after ${timeoutSec}s`);
    return t;
  }

  // A second look one interval later catches double-sends (a common retry bug). In sent capture the same search
  // also carries each copy's provider receipt, so keep looking (within the deadline) until every receipt is final.
  const checkDuplicates = flow.checkDuplicates ?? spec.defaults?.checkDuplicates ?? true;
  let lookedAgain = false;
  while (Date.now() < deadline) {
    const receiptsFinal = folder !== "sent" || candidates.every(isDeliveryTerminal);
    if ((lookedAgain || !checkDuplicates) && receiptsFinal) break;
    await sleep(Math.min(pollSec * 1000, Math.max(0, deadline - Date.now())));
    const again = await findCandidates({ address, expect, windowStart, baseline, folder });
    if (again.length >= candidates.length) candidates = again; // same or more copies, with fresher receipts
    lookedAgain = true;
  }

  const first = candidates.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const sentAt = first.date ? new Date(first.date) : null;
  const latency = sentAt && sentAt >= triggeredAt ? (sentAt - triggeredAt) / 1000 : null;
  const upperBound = (detectedAt - triggeredAt) / 1000;
  t.timings = { triggeredAt: triggeredAt.toISOString(), detectedAt: detectedAt.toISOString(), headerLatencySec: latency, detectedWithinSec: upperBound, polls: attempts };
  t.checks.push({
    id: "DLV-001",
    title: folder === "sent" ? "App sent the email through Mermail" : "Email delivered",
    status: STATUS.PASS,
    detail: `${folder === "sent" ? "dispatched copy found in Sent" : "arrived in the Inbox"}; detected within ${upperBound.toFixed(1)}s`,
  });
  const measured = latency ?? upperBound;
  t.checks.push({
    id: "DLV-002",
    title: `Delivered within ${maxLatencySec}s`,
    status: measured <= maxLatencySec ? STATUS.PASS : STATUS.WARN,
    detail:
      latency == null
        ? `≤ ${upperBound.toFixed(1)}s (detection bound)`
        : folder === "sent"
          ? `queued ${latency.toFixed(1)}s after the trigger, then dispatched after Mermail's undo window`
          : `${latency.toFixed(1)}s trigger → Date header`,
  });
  t.checks.push({
    id: "DLV-003",
    title: "Exactly one email per trigger",
    status: candidates.length === 1 ? STATUS.PASS : STATUS.FAIL,
    detail: candidates.length === 1 ? "no duplicate sends" : `${candidates.length} matching emails: duplicate send or ambiguous match (${candidates.map((x) => x.id).join(", ")})`,
  });

  // 5. Full read of the selected message, size-bounded. Inbound mail is scan-gated; outbound copies are never scanned.
  const record = await mcp.call("get_email", {
    mailboxId: mailbox.public_id,
    emailId: first.id,
    query: folder === "sent" ? { max_body_chars: 100000 } : { require_scan_status: "clean", max_body_chars: 100000 },
  });
  if (folder === "sent") {
    const receipt = isDeliveryTerminal(record) ? record : first; // the search metadata carries the same receipt fields
    t.checks.push(deliveryReceiptCheck(receipt));
  }
  const message = normalizeMessage(record);
  t.message = { id: message.id, subject: message.subject, from: message.from, to: message.to, date: message.date, scanStatus: message.scanStatus, capture: folder };
  step(`read ${c(90, message.id)} "${message.subject}"`);

  const checks = runMessageChecks(message, expect, ctx);
  t.checks.push(...checks);
  const ctaHref = checks.find((x) => x.id === "LNK-003")?.cta;
  const otp = checks.find((x) => x.id === "OTP-001")?.otp;
  if (ctaHref) vars.link = ctaHref;
  if (otp) vars.otp = otp;
  for (const x of checks) delete x.cta, delete x.otp; // keep secrets out of reports

  // 6. Follow the call-to-action exactly once, only to user-allowlisted hosts.
  if (expect.link?.follow && ctaHref) t.checks.push(await followLink(ctaHref, expect.link, ctx));

  // 7. Assert the app's state changed (the real end of the flow).
  for (const [i, stepSpec] of (flow.then ?? []).entries()) {
    const id = `E2E-${String(i + 1).padStart(3, "0")}`;
    try {
      const out = await runAction(stepSpec, vars);
      const problems = [];
      if (stepSpec.expectStatus && out.status !== stepSpec.expectStatus) problems.push(`status ${out.status} ≠ ${stepSpec.expectStatus}`);
      if (stepSpec.expectJson && !jsonSubsetMatches(out.json, stepSpec.expectJson)) problems.push(`body ${JSON.stringify(out.json)} does not contain ${JSON.stringify(stepSpec.expectJson)}`);
      if (stepSpec.expectBodyContains && !String(out.body).includes(stepSpec.expectBodyContains)) problems.push(`body missing "${stepSpec.expectBodyContains}"`);
      t.checks.push({ id, title: stepSpec.title ?? `Post-condition: ${describeAction(stepSpec, vars)}`, status: problems.length ? STATUS.FAIL : STATUS.PASS, detail: problems.join("; ") || out.summary });
    } catch (error) {
      t.checks.push({ id, title: stepSpec.title ?? "Post-condition", status: STATUS.FAIL, detail: error.message });
    }
  }

  for (const x of t.checks) log(`  ${ICON[x.status]} ${c(90, x.id)} ${x.title}${x.status === STATUS.PASS ? "" : c(90, ` — ${x.detail}`)}`);
  t.summary = summarize(t.checks);
  t.state = t.summary.status === STATUS.FAIL ? "failed" : t.summary.status === STATUS.WARN ? "passed_with_warnings" : "passed";
  return t;
}

function flowAddress(flow, index) {
  if (flow.address) return normalizeAddress(substitute(flow.address, { runId, flowId: flow.id, mailbox: mailbox.email }));
  if (spec.plusAddressing) {
    const [local, domain] = mailbox.email.split("@");
    return `${local}+e2e-${runId}@${domain}`.toLowerCase(); // one address per run so later flows reach the same account
  }
  return mailbox.email.toLowerCase();
}

async function findCandidates({ address, expect, windowStart, baseline, folder }) {
  const subjectHint = typeof expect.subject === "string" && !toRegExp(expect.subject) ? expect.subject.slice(0, 60) : undefined;
  const result = await mcp.call("search_emails", {
    mailboxId: mailbox.public_id,
    query: {
      folder,
      to: address,
      ...(subjectHint ? { subject: subjectHint } : {}),
      date_start: windowStart,
      metadata_only: true,
      include_held: true,
      page: 1,
      limit: 10,
    },
  });
  return asList(result, "emails").filter((e) => {
    if (!e?.id || baseline.has(e.id)) return false;
    const where = String(e.folder_id ?? e.folder_name ?? e.folder ?? folder).toLowerCase();
    if (!where.includes(folder)) return false; // inbox mode never counts Sent copies, and vice versa
    const to = String(e.recipient ?? e.to ?? "").toLowerCase().split(/[,;]/).map(normalizeAddress);
    if (to.length && to[0] && !to.includes(address)) return false;
    if (expect.subject && !(toRegExp(expect.subject) ?? { test: (s) => s === expect.subject }).test(e.subject ?? "")) return false;
    return true;
  });
}

async function listRecent(mailboxId, folder) {
  const result = await mcp.call("list_emails", {
    mailboxId,
    query: { folder, page: 1, limit: 50, sortColumn: "date", sortDirection: "DESC", metadata_only: true },
  });
  return asList(result, "emails");
}

async function resolveMailbox(selector) {
  if (!selector) die('spec.mailbox is required: the Mermail mailbox email or public_id to receive test mail.');
  const mailboxes = asList(await mcp.call("list_mailboxes", {}), "mailboxes");
  const want = String(selector).toLowerCase();
  const matches = mailboxes.filter((m) => [m.public_id, m.email, m.id].filter(Boolean).map((v) => String(v).toLowerCase()).includes(want));
  if (matches.length !== 1) {
    die(`Mailbox ${selector} ${matches.length ? "is ambiguous" : "was not found"} in this workspace. Known: ${mailboxes.map((m) => m.email).join(", ") || "(none)"}`);
  }
  const m = matches[0];
  if (m.disabled_at || m.can_receive === false || (m.receiving_status && m.receiving_status !== "ready")) {
    die(`Mailbox ${m.email} cannot receive mail right now (receiving_status=${m.receiving_status ?? "unknown"}).`);
  }
  return m;
}

async function followLink(href, linkSpec, ctx) {
  const id = "LNK-006";
  const title = "Call-to-action link works end to end";
  let url = parseUrl(href);
  const hops = [];
  for (let hop = 0; hop <= 5; hop += 1) {
    if (!url) return { id, title, status: STATUS.FAIL, detail: "unparseable URL" };
    const allowed = ctx.linkHosts.length ? hostAllowed(url, ctx.linkHosts) : isLocalHost(url.hostname);
    if (!allowed) return { id, title, status: STATUS.FAIL, detail: `refused to follow ${url.host}: not on the spec's linkHosts allowlist` };
    let response;
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      return { id, title, status: STATUS.FAIL, detail: `${redactUrl(url.toString())} unreachable: ${error.cause?.code ?? error.message}` };
    }
    hops.push(`${response.status} ${url.host}${url.pathname}`);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = parseUrl(new URL(location, url).toString());
      continue;
    }
    const body = await response.text();
    const want = linkSpec.expectStatus ?? 200;
    const problems = [];
    if (response.status !== want) problems.push(`HTTP ${response.status} (expected ${want})`);
    if (linkSpec.expectBodyContains && !body.includes(linkSpec.expectBodyContains)) problems.push(`page missing "${linkSpec.expectBodyContains}"`);
    const snippet = htmlToText(body).replace(/\s+/g, " ").trim().slice(0, 120);
    return { id, title, status: problems.length ? STATUS.FAIL : STATUS.PASS, detail: `${hops.join(" → ")}${problems.length ? `: ${problems.join(", ")}; page says "${snippet}"` : ""}` };
  }
  return { id, title, status: STATUS.FAIL, detail: `too many redirects: ${hops.join(" → ")}` };
}

async function runAction(action, vars, { strict = false } = {}) {
  if (!action) throw new Error("missing trigger/step definition");
  if (action.http) {
    const h = substitute(action.http, vars);
    const init = { method: h.method ?? "GET", headers: { ...(h.headers ?? {}) }, signal: AbortSignal.timeout((h.timeoutSec ?? 30) * 1000) };
    if (h.json !== undefined) {
      init.body = JSON.stringify(h.json);
      init.headers["content-type"] ??= "application/json";
    } else if (h.body !== undefined) init.body = String(h.body);
    let response;
    try {
      response = await fetch(h.url, init);
    } catch (error) {
      throw new Error(`${init.method} ${h.url} failed: ${error.cause?.code ?? error.message}. Is the app running?`);
    }
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {}
    const wanted = h.expectStatus ?? action.expectStatus;
    if (strict && (wanted ? response.status !== wanted : response.status >= 400)) {
      throw new Error(`${init.method} ${h.url} → HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    return { status: response.status, body, json, summary: `HTTP ${response.status}` };
  }
  if (action.command) {
    const argv = substitute(action.command, vars);
    if (!Array.isArray(argv) || !argv.length) throw new Error("command must be an argv array, e.g. [\"npm\", \"run\", \"signup\", \"--\", \"{address}\"]");
    return await new Promise((resolve, reject) => {
      const child = spawn(argv[0], argv.slice(1), { cwd: action.cwd ? path.resolve(path.dirname(specPath), action.cwd) : process.cwd(), shell: false, env: process.env });
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      const timer = setTimeout(() => child.kill("SIGTERM"), (action.timeoutSec ?? 60) * 1000);
      child.on("error", (e) => (clearTimeout(timer), reject(e)));
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ status: 0, body: output, json: null, summary: "exit 0" });
        else reject(new Error(`${argv[0]} exited ${code}: ${output.trim().slice(-200)}`));
      });
    });
  }
  throw new Error("each trigger/step needs either `http` or `command`");
}

function describeAction(action, vars) {
  if (action?.http) {
    const h = substitute(action.http, vars);
    return `${h.method ?? "GET"} ${h.url.replace(/[\w.+-]+(?:%40|@)[\w.-]+/g, (m) => m.replace(/^(.{3}).*?(%40|@)/, "$1…$2"))}`;
  }
  if (action?.command) return substitute(action.command, vars).join(" ");
  return "(none)";
}

// ----------------------------------------------------------------------------- MCP client

function createMcpClient({ endpoint, apiKey, rpm }) {
  const calls = [];
  let nextId = 1;
  let initialized = false;
  const headerName = "x-api-key";

  async function post(body) {
    // Free plans allow 10 requests/minute per workspace; stay under the configured budget.
    for (;;) {
      const now = Date.now();
      while (calls.length && now - calls[0] > 60_000) calls.shift();
      if (calls.length < rpm) break;
      await sleep(60_000 - (now - calls[0]) + 50);
    }
    calls.push(Date.now());
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json", [headerName]: apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after") ?? 10);
      if (wait > 60) die(`Mermail rate limit: retry after ${wait}s.`);
      await sleep(wait * 1000);
      return post(body);
    }
    if (response.status === 401) die("Mermail rejected the API key (401). Check MERMAIL_API_KEY; do not paste it anywhere.");
    if (response.status === 402) die("Mermail API credits are exhausted for this workspace period (402).");
    if (response.status === 403) die("Mermail returned 403: plan gate, wrong workspace, or missing role.");
    if (!response.ok) die(`Mermail MCP returned HTTP ${response.status}.`);
    const text = await response.text();
    const payload = text.trimStart().startsWith("{") ? JSON.parse(text) : parseSse(text);
    if (payload.error) die(`Mermail MCP error ${payload.error.code}: ${payload.error.message}`);
    return payload.result;
  }

  async function call(name, argumentsObject, attempt = 0) {
    if (!initialized) {
      await post({ jsonrpc: "2.0", id: nextId++, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mermail-email-e2e", version: VERSION } } });
      initialized = true;
    }
    const result = await post({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: argumentsObject } });
    const text = result?.content?.find((part) => part.type === "text")?.text;
    if (result?.isError) {
      // Mermail reports the workspace RPM limit as a tool error; the app under test and the agent share that budget.
      if (/rate_limit_exceeded|too many requests/i.test(text ?? "") && attempt < 4) {
        const wait = 15 * (attempt + 1);
        log(`  ${c(33, "·")} ${c(90, `Mermail rate limit (shared 10 RPM on Free); backing off ${wait}s`)}`);
        await sleep(wait * 1000);
        return call(name, argumentsObject, attempt + 1);
      }
      die(`${name} failed: ${(text ?? "unknown error").slice(0, 300)}`);
    }
    if (result?.structuredContent) return result.structuredContent;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return { call };
}

function parseSse(text) {
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return JSON.parse(data.at(-1) ?? "{}");
}

function asList(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

// ----------------------------------------------------------------------------- spec + templating

async function loadSpec(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    die(`Spec not found: ${file}. Ask the agent to "create an email e2e spec", or copy templates/email-e2e.example.json.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    die(`Spec is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed.flows) || !parsed.flows.length) die("Spec needs a non-empty `flows` array.");
  const ids = new Set();
  for (const flow of parsed.flows) {
    if (!flow.id) die("Every flow needs an `id`.");
    if (ids.has(flow.id)) die(`Duplicate flow id ${flow.id}.`);
    ids.add(flow.id);
    if (!flow.trigger) die(`Flow ${flow.id} needs a \`trigger\`.`);
    const capture = flow.capture ?? parsed.capture ?? "inbox";
    if (!["inbox", "sent"].includes(capture)) die(`Flow ${flow.id}: capture must be "inbox" or "sent".`);
  }
  // "{env:NAME}" in any string reads the process environment, so one spec works locally and in CI.
  const missingEnv = new Set();
  parsed = JSON.parse(JSON.stringify(parsed), (key, value) =>
    typeof value === "string" && !key.startsWith("$") // "$comment" documents the syntax; never expand it
      ? value.replace(/\{env:(\w+)\}/g, (whole, name) => {
          if (process.env[name] === undefined) missingEnv.add(name);
          return process.env[name] ?? whole;
        })
      : value,
  );
  if (missingEnv.size) die(`Spec references unset environment variable(s): ${[...missingEnv].join(", ")}.`);
  if (parsed.mode === "production" && !process.env.MERMAIL_E2E_ALLOW_PRODUCTION) {
    die('Spec mode is "production": triggers create real accounts and send real mail. Set MERMAIL_E2E_ALLOW_PRODUCTION=1 to confirm.');
  }
  return parsed;
}

function substitute(value, vars) {
  if (typeof value === "string") {
    return value.replace(/\{(\w+)(\|url)?\}/g, (whole, name, filter) => {
      if (!(name in vars) || vars[name] === undefined) return whole;
      return filter ? encodeURIComponent(vars[name]) : String(vars[name]);
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  return value;
}

// ----------------------------------------------------------------------------- reports

function buildReport(flows) {
  const all = flows.flatMap((f) => f.checks);
  return {
    tool: "mermail-email-e2e",
    version: VERSION,
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    mailbox: { email: mailbox.email, public_id: mailbox.public_id },
    mode: spec.mode ?? "dev",
    summary: { ...summarize(all), flows: flows.length, failedFlows: flows.filter((f) => f.checks.some((x) => x.status === STATUS.FAIL)).length },
    flows,
  };
}

async function writeReports(report) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(reportDir, "report.md"), toMarkdown(report));
  await writeFile(path.join(reportDir, "junit.xml"), toJUnit(report));
}

function toMarkdown(report) {
  const badge = { pass: "✅ PASS", warn: "⚠️ WARN", fail: "❌ FAIL", info: "ℹ️ INFO", skip: "⏭ SKIP" };
  const lines = [
    `# Email E2E report: ${badge[report.summary.status]}`,
    "",
    `Run \`${report.runId}\` · ${report.startedAt} · mailbox \`${report.mailbox.email}\` · mode \`${report.mode}\``,
    "",
    `**${report.summary.pass} passed · ${report.summary.warn} warnings · ${report.summary.fail} failed** across ${report.summary.flows} flow(s).`,
    "",
  ];
  for (const f of report.flows) {
    lines.push(`## ${f.title} (\`${f.flow}\`): ${f.state}`, "");
    if (f.message) lines.push(`Message \`${f.message.id}\` · "${f.message.subject}" · from \`${f.message.from}\` · scan \`${f.message.scanStatus ?? "n/a"}\``, "");
    lines.push("| | Check | Result | Detail |", "| --- | --- | --- | --- |");
    for (const x of f.checks) lines.push(`| ${badge[x.status].split(" ")[0]} | ${x.id} | ${x.title} | ${String(x.detail).replace(/\|/g, "\\|")} |`);
    lines.push("");
  }
  lines.push("_OTPs and link tokens are redacted. Generated by [mermail-email-e2e](https://github.com/Anuragt1104/mermail-email-e2e)._", "");
  return lines.join("\n");
}

function toJUnit(report) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const suites = report.flows.map((f) => {
    const cases = f.checks.map((x) => {
      const body = x.status === STATUS.FAIL ? `<failure message="${esc(x.detail)}"/>` : x.status === STATUS.SKIP ? "<skipped/>" : x.status === STATUS.WARN ? `<system-out>${esc(`WARN: ${x.detail}`)}</system-out>` : "";
      return `    <testcase classname="email-e2e.${esc(f.flow)}" name="${esc(`${x.id} ${x.title}`)}">${body}</testcase>`;
    });
    const failures = f.checks.filter((x) => x.status === STATUS.FAIL).length;
    return `  <testsuite name="${esc(f.title)}" tests="${f.checks.length}" failures="${failures}">\n${cases.join("\n")}\n  </testsuite>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="mermail-email-e2e" tests="${report.flows.reduce((n, f) => n + f.checks.length, 0)}" failures="${report.summary.fail}">\n${suites.join("\n")}\n</testsuites>\n`;
}

function printSummary(report) {
  const s = report.summary;
  const verdict = s.fail ? c(41, " FAIL ") : s.warn ? c(43, " PASS with warnings ") : c(42, " PASS ");
  log(`\n${verdict} ${s.pass} passed · ${s.warn} warnings · ${s.fail} failed · ${s.flows} flow(s)`);
  log(c(90, `reports → ${path.relative(process.cwd(), reportDir)}/report.md, report.json, junit.xml`));
}

// ----------------------------------------------------------------------------- utils

function step(message, transient = false) {
  if (transient && color) process.stdout.write(`\r\x1b[2K  ${c(90, "·")} ${message}`);
  else if (!transient || !color) log(`  ${c(90, "·")} ${message}`);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function die(message) {
  process.stderr.write(`${color ? "\x1b[31m" : ""}mermail-email-e2e: ${message}${color ? "\x1b[0m" : ""}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2);
      const v = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
      out[k] = out[k] === undefined ? v : [].concat(out[k], v);
    }
  }
  return out;
}

function usage(code) {
  log(`mermail-email-e2e ${VERSION}

Usage: node run-email-e2e.mjs [--spec .mermail/email-e2e.json] [--flow <id>]... [--report-dir dir] [--rpm 6] [--dry-run]

Environment:
  MERMAIL_API_KEY   workspace project key (required; never pass it as an argument)
  MERMAIL_MCP_URL   override the MCP endpoint (default https://console.mermail.app/mcp)
  MERMAIL_E2E_ALLOW_PRODUCTION=1  required when spec.mode is "production"

Exit codes: 0 all flows passed (warnings allowed) · 1 at least one check failed · 2 configuration or Mermail error`);
  process.exit(code);
}

