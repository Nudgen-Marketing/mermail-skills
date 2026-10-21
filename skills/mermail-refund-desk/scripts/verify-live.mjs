#!/usr/bin/env node
/**
 * mermail-refund-desk / verify-live
 *
 * Read-only live verification that this skill can actually reach Mermail and that every tool it
 * composes exists on the connected server. It NEVER sends mail, NEVER moves money, and never calls
 * a write tool — it is safe to run against a real workspace.
 *
 *   MERMAIL_API_KEY=… node scripts/verify-live.mjs
 *   MERMAIL_API_KEY=… node scripts/verify-live.mjs --mailbox mbx_… --search "charged twice" --json
 *
 * Auth: `x-api-key` (prefix `sk-proj-`). The key is read from the environment and is never printed,
 * echoed, or included in output. PayBox/wallet tools require full-profile MCP OAuth and are reported
 * as a separate expectation, not as a failure of this read-only check.
 *
 * Exit codes: 0 = verification passed
 *             2 = usage/config error (missing key)
 *             3 = tool catalog mismatch
 *             4 = authentication or authorization rejected
 *             5 = rate-limited
 *             6 = provider error or timeout
 */

import { setTimeout as delay } from "node:timers/promises";

export const DEFAULT_ENDPOINT = "https://console.mermail.app/mcp";
export const PROTOCOL_VERSION = "2025-03-26";

/** Tools this workflow composes and therefore requires on the connected server. */
export const REQUIRED_TOOLS = [
  "list_workspaces",
  "list_mailboxes",
  "search_emails",
  "list_emails",
  "get_email",
  "get_email_context",
  "get_thread",
  "save_draft",
  "reply_to_email",
  "create_custom_label",
  "move_email",
];

/** Present only on full-profile OAuth sessions; absence from an API-key catalog is expected. */
export const WALLET_TOOLS = [
  "get_paybox_connection",
  "paybox_list_credentials",
  "paybox_get_portfolio",
  "paybox_request_transfer",
  "paybox_get_request",
];

export class McpError extends Error {
  constructor(kind, message, details = {}) {
    super(message);
    this.name = "McpError";
    this.kind = kind;
    this.details = details;
  }
}

export function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider";
  if (status >= 400) return "request";
  return "ok";
}

/** Text of a tool-level error, whichever shape the host used. */
export function toolErrorText(result) {
  const structured = result?.structuredContent;
  if (structured && typeof structured === "object") {
    const code = structured.code ?? structured.error;
    if (typeof code === "string") return code;
  }
  const parts = Array.isArray(result?.content) ? result.content : [];
  const textPart = parts.find((part) => part?.type === "text");
  return typeof textPart?.text === "string" ? textPart.text : "";
}

/**
 * A tool can fail at HTTP 200 with `isError: true` and a provider code. Rate limiting and validation
 * failures must not be flattened into a generic tool fault, because the correct handling differs:
 * stop and report the limit, versus self-correct the arguments.
 */
export function classifyToolError(name, result) {
  const text = toolErrorText(result);
  if (/rate_limit|rate limit|too many requests|429/i.test(text)) {
    return new McpError("rate_limit", `tool ${name} was rate limited`, { excerpt: text.slice(0, 200) });
  }
  if (/validation|invalid arguments|invalid input/i.test(text)) {
    return new McpError("request", `tool ${name} rejected its arguments`, { excerpt: text.slice(0, 200) });
  }
  return new McpError("tool", `tool ${name} returned isError`, { excerpt: text.slice(0, 300) });
}

export function exitCodeForKind(kind) {
  switch (kind) {
    case "auth": return 4;
    case "rate_limit": return 5;
    case "provider": return 6;
    case "timeout": return 6;
    default: return 6;
  }
}

/** Streamable HTTP may answer with JSON or with an SSE stream; accept both. */
export function parseMcpBody(text, contentType = "") {
  const trimmed = text.trim();
  if (!trimmed) throw new McpError("malformed", "empty response body");
  try {
    if (contentType.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
      const payloads = trimmed
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      if (payloads.length === 0) throw new McpError("malformed", "no data frames in SSE response");
      return JSON.parse(payloads[payloads.length - 1]);
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error instanceof McpError) throw error;
    // A non-JSON body must surface as a classified transport fault, never as a raw syntax error.
    throw new McpError("malformed", `unparseable response body: ${error.message}`, {
      excerpt: trimmed.slice(0, 120),
    });
  }
}

export function createClient({ endpoint = DEFAULT_ENDPOINT, apiKey, timeoutMs = 20000 } = {}) {
  let nextId = 1;

  async function rpc(method, params = {}) {
    const id = nextId++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new McpError("timeout", `request timed out after ${timeoutMs}ms`);
      }
      throw new McpError("provider", `transport failure: ${error?.message ?? error}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const kind = classifyHttpStatus(response.status);
      const body = await response.text().catch(() => "");
      throw new McpError(kind, `HTTP ${response.status} (${kind})`, {
        status: response.status,
        bodyExcerpt: body.slice(0, 300),
      });
    }

    const text = await response.text();
    const parsed = parseMcpBody(text, response.headers.get("content-type") ?? "");
    if (parsed?.error) {
      throw new McpError("request", `JSON-RPC error: ${parsed.error.message ?? "unknown"}`, {
        code: parsed.error.code,
      });
    }
    return parsed?.result ?? parsed;
  }

  return {
    endpoint,
    initialize: () => rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mermail-refund-desk", version: "1.0.0" },
    }),
    listTools: async () => (await rpc("tools/list", {})).tools ?? [],
    callTool: async (name, args = {}) => {
      const result = await rpc("tools/call", { name, arguments: args });
      if (result?.isError) {
        throw classifyToolError(name, result);
      }
      return result;
    },
    raw: rpc,
  };
}

/** Mermail folds flat Sold fields into `body`, but a native object is the documented shape. */
export function buildSearchQuery({ query, sender, dateStart, metadataOnly = true } = {}) {
  const q = { ...(query ? { query } : {}), ...(sender ? { from: sender } : {}) };
  if (dateStart) q.date_start = dateStart;
  if (metadataOnly) q.metadata_only = true;
  return q;
}

// ------------------------------------------------------------------------------- CLI
function usage() {
  return [
    "usage: verify-live [--catalog-only] [--endpoint URL] [--mailbox mbx_id] [--search TEXT]",
    "                   [--sender ADDRESS] [--timeout-ms N] [--json]",
    "",
    "Read-only. Requires MERMAIL_API_KEY in the environment (never printed).",
    "--catalog-only stops after initialize + tools/list, spending two calls.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { endpoint: process.env.MERMAIL_MCP_URL || DEFAULT_ENDPOINT, timeoutMs: 20000, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--endpoint") out.endpoint = next();
    else if (arg === "--mailbox") out.mailbox = next();
    else if (arg === "--search") out.search = next();
    else if (arg === "--sender") out.sender = next();
    else if (arg === "--timeout-ms") out.timeoutMs = Number(next());
    else if (arg === "--catalog-only") out.catalogOnly = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function summarize(result) {
  const structured = result?.structuredContent;
  if (structured && typeof structured === "object") {
    const items = structured.items;
    if (Array.isArray(items)) return items;
    return structured;
  }
  const content = result?.content;
  if (Array.isArray(content)) {
    const textPart = content.find((part) => part?.type === "text");
    if (textPart?.text) {
      try {
        const parsed = JSON.parse(textPart.text);
        return Array.isArray(parsed?.items) ? parsed.items : parsed;
      } catch {
        return textPart.text.slice(0, 200);
      }
    }
  }
  return null;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const apiKey = process.env.MERMAIL_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      "MERMAIL_API_KEY is not set. Create a workspace API key in Mermail (Settings -> API Keys), export it,\n" +
      "and re-run. Never paste a key into chat or commit it. For PayBox/payout checks use full-profile OAuth.\n",
    );
    return 2;
  }

  const client = createClient({ endpoint: args.endpoint, apiKey, timeoutMs: args.timeoutMs });
  const report = { endpoint: args.endpoint, checks: [], auth: "api-key", walletTools: "not expected on api-key" };
  const record = (name, ok, detail) => report.checks.push({ name, ok, detail });

  try {
    const init = await client.initialize();
    record("initialize", true, init?.serverInfo?.name ?? "server responded");
    report.server = init?.serverInfo ?? null;
  } catch (error) {
    record("initialize", false, `${error.kind}: ${error.message}`);
    emit(report, args);
    process.stderr.write(`initialize failed: ${error.kind} — ${error.message}\n`);
    return exitCodeForKind(error.kind);
  }

  let catalog = [];
  try {
    catalog = await client.listTools();
    const names = catalog.map((tool) => tool.name);
    const missing = REQUIRED_TOOLS.filter((tool) => !names.includes(tool));
    record("tools/list", missing.length === 0, `${names.length} tools; missing ${missing.length}`);
    report.toolCount = names.length;
    report.missingRequiredTools = missing;
    report.walletToolsPresent = WALLET_TOOLS.filter((tool) => names.includes(tool));
    for (const tool of REQUIRED_TOOLS) {
      record(`tool:${tool}`, names.includes(tool), names.includes(tool) ? "present" : "absent");
    }
  } catch (error) {
    record("tools/list", false, `${error.kind}: ${error.message}`);
    emit(report, args);
    return exitCodeForKind(error.kind);
  }

  const missingRequired = report.missingRequiredTools ?? [];
  if (missingRequired.length > 0) {
    emit(report, args);
    process.stderr.write(`missing required tools: ${missingRequired.join(", ")}\n`);
    return 3;
  }

  // Stop after the catalog check: two calls total, useful on rate-limited workspaces and as a
  // connection smoke test before a run that spends more of the workspace's call budget.
  if (args.catalogOnly) {
    emit(report, args);
    return 0;
  }

  try {
    const workspaces = summarize(await client.callTool("list_workspaces", {}));
    const list = Array.isArray(workspaces) ? workspaces : (workspaces?.workspaces ?? []);
    report.workspaces = list.map((ws) => ({ id: ws.id ?? ws.workspaceId ?? null, name: ws.name ?? null }));
    record("list_workspaces", true, `${report.workspaces.length} workspace(s)`);
  } catch (error) {
    record("list_workspaces", false, `${error.kind}: ${error.message}`);
  }

  try {
    const mailboxes = summarize(await client.callTool("list_mailboxes", {}));
    const list = Array.isArray(mailboxes) ? mailboxes : (mailboxes?.mailboxes ?? []);
    report.mailboxes = list.map((mb) => ({
      public_id: mb.public_id ?? null,
      email: mb.email ?? null,
      receiving_status: mb.receiving_status ?? null,
      can_receive: mb.can_receive ?? null,
    }));
    record("list_mailboxes", true, `${report.mailboxes.length} mailbox(es)`);
  } catch (error) {
    record("list_mailboxes", false, `${error.kind}: ${error.message}`);
  }

  if (args.search || args.mailbox) {
    try {
      const query = buildSearchQuery({ query: args.search, sender: args.sender });
      const args2 = { ...(args.mailbox ? { mailboxId: args.mailbox } : {}), query };
      const found = summarize(await client.callTool("search_emails", args2));
      const list = Array.isArray(found) ? found : (found?.emails ?? []);
      report.matchedEmails = list.slice(0, 10).map((email) => ({
        message_id: email.id ?? email.message_id ?? null,
        from: email.from ?? email.sender ?? null,
        subject: email.subject ?? null,
        scan_status: email.scan_status ?? null,
      }));
      record("search_emails", true, `${report.matchedEmails.length} match(es), metadata only`);
    } catch (error) {
      record("search_emails", false, `${error.kind}: ${error.message}`);
    }
  }

  emit(report, args);
  const failed = report.checks.filter((check) => !check.ok);
  return failed.length === 0 ? 0 : 3;
}

function emit(report, args) {
  const ok = report.checks.every((check) => check.ok);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ ok, ...report }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Mermail refund-desk live verification (read-only)\n`);
  process.stdout.write(`  endpoint: ${report.endpoint}\n`);
  process.stdout.write(`  server:   ${report.server?.name ?? "unknown"} ${report.server?.version ?? ""}\n`);
  process.stdout.write(`  catalog:  ${report.toolCount ?? 0} tools\n`);
  for (const check of report.checks) {
    process.stdout.write(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}\n`);
  }
  if (report.mailboxes?.length) {
    process.stdout.write(`  mailboxes:\n`);
    for (const mb of report.mailboxes) {
      process.stdout.write(`    ${mb.email} (${mb.public_id}) receiving=${mb.receiving_status} can_receive=${mb.can_receive}\n`);
    }
  }
  if (report.matchedEmails?.length) {
    process.stdout.write(`  matched messages:\n`);
    for (const email of report.matchedEmails) {
      process.stdout.write(`    ${email.message_id} | ${email.from} | ${email.subject} | scan=${email.scan_status}\n`);
    }
  }
  process.stdout.write(`  result: ${ok ? "PASS" : "FAIL"}\n`);
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
