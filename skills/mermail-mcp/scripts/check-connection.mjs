#!/usr/bin/env node
import process from "node:process";

const endpoint = process.env.MERMAIL_MCP_URL || "https://console.mermail.app/mcp";
const apiKey = process.env.MERMAIL_API_KEY;
let endpointUrl;
try {
  endpointUrl = new URL(endpoint);
} catch {
  fail("Mermail MCP endpoint is invalid.");
}
if (endpointUrl.protocol !== "https:" || endpointUrl.hostname !== "console.mermail.app" ||
    (endpointUrl.port && endpointUrl.port !== "443") || endpointUrl.pathname !== "/mcp" ||
    endpointUrl.username || endpointUrl.password || endpointUrl.hash) {
  fail("Mermail MCP endpoint must use the canonical HTTPS console endpoint.");
}
const profile = endpointUrl.searchParams.get("profile");
if ((profile && profile !== "agent-inbox") ||
    [...endpointUrl.searchParams.keys()].some((name) => name !== "profile") ||
    endpointUrl.searchParams.getAll("profile").length > 1) {
  fail("Unsupported Mermail MCP profile.");
}
const currentFullCatalogBaseline = 83;
const compatibleFullCatalogFloor = 63;
const agentInboxTools = [
  "get_api_credit_usage",
  "list_workspaces",
  "get_workspace",
  "list_email_domains",
  "list_workspace_mailboxes",
  "list_mailboxes",
  "create_mailbox",
  "get_mailbox",
  "list_emails",
  "search_emails",
  "get_email",
  "get_email_context"
];
const fullCatalogCanaries = [
  "prepare_destructive_action",
  ...agentInboxTools,
  "send_email",
  "reply_to_email",
  "forward_email",
  "save_draft",
  "schedule_email_send"
];

if (!apiKey) fail("MERMAIL_API_KEY is not set in this process environment.");
const mermailKeyPrefix = `${["sk", "proj"].join("-")}-`;
if (!apiKey.startsWith(mermailKeyPrefix) || apiKey.length < 20) fail("MERMAIL_API_KEY has an invalid format.");

const initialize = await request({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mermail-skill-check", version: "1.5.7" }
  }
});

if (!initialize.result?.serverInfo) fail("MCP initialize did not return serverInfo.");

const listed = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const tools = listed.result?.tools;
if (!Array.isArray(tools)) fail("MCP tools/list did not return a tools array.");
if (tools.some((tool) => !tool || typeof tool.name !== "string")) {
  fail("MCP tools/list returned an invalid tool entry.");
}
const names = new Set(tools.map((tool) => tool.name));
if (names.size !== tools.length) fail("MCP tools/list returned duplicate tool names.");
const required = profile === "agent-inbox" ? agentInboxTools : fullCatalogCanaries;
const missing = required.filter((name) => !names.has(name));
if (missing.length) fail(`MCP is missing required tools: ${missing.join(", ")}.`);
if (profile === "agent-inbox" && (tools.length !== 12 || names.size !== 12)) {
  fail(`Expected the exact 12-tool agent-inbox profile but discovered ${tools.length} entries.`);
}
if (!profile && (tools.length < compatibleFullCatalogFloor || names.size < compatibleFullCatalogFloor)) {
  fail(`Expected at least the 63-tool full-catalog baseline but discovered ${tools.length} entries.`);
}
if (!profile && tools.length < currentFullCatalogBaseline) {
  console.warn(
    `Connected, but discovered ${tools.length} tools below the current ${currentFullCatalogBaseline}-tool base; the server may be on a gradual or older deployment.`
  );
}

console.log(
  `Connected to Mermail; discovered ${tools.length} tools (${profile ?? "full"} profile).`
);

async function request(body) {
  const httpPost = globalThis["fetch"];
  let response;
  try {
    response = await httpPost(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "x-api\u002dkey": apiKey
      },
      body: JSON.stringify(body)
    });
  } catch {
    fail("MCP network request failed or timed out.");
  }
  if (!response.ok) fail(`MCP returned HTTP ${response.status}.`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail("MCP returned an invalid JSON response.");
  }
  if (payload?.jsonrpc !== "2.0" || payload.id !== body.id) fail("MCP returned an invalid response envelope.");
  if (payload.error) {
    const code = Number.isSafeInteger(payload.error.code) ? payload.error.code : "unknown";
    fail(`MCP request failed (code ${code}).`);
  }
  return payload;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
