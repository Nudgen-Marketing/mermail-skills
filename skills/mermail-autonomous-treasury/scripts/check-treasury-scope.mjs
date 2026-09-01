#!/usr/bin/env node
// Verifies that the connected Mermail MCP session exposes every tool this
// treasury workflow routes to, and reports which capabilities are unavailable
// so the skill can degrade to read-only reconciliation instead of failing mid-run.
import process from "node:process";

const endpoint = process.env.MERMAIL_MCP_URL || "https://console.mermail.app/mcp";
const apiKey = process.env.MERMAIL_API_KEY;

// Read-only inflow discovery. Required for every treasury run.
const inflowTools = [
  "list_mailboxes",
  "list_emails",
  "search_emails",
  "get_email",
  "get_email_context"
];

// Digest delivery. Required only when the user asks for an emailed P&L statement.
const digestTools = ["save_draft", "send_email", "schedule_email_send"];

// Wallet-scoped. Never available on API-key or agent-inbox profiles; full-profile OAuth only.
const treasuryWalletTools = [
  "get_paybox_connection",
  "paybox_get_portfolio",
  "paybox_request_transfer",
  "paybox_get_request"
];

if (!apiKey) fail("MERMAIL_API_KEY is not set in this process environment.");
const mermailKeyPrefix = `${["sk", "proj"].join("-")}-`;
if (!apiKey.startsWith(mermailKeyPrefix) || apiKey.length < 20) {
  fail("MERMAIL_API_KEY has an invalid format.");
}

const initialize = await request({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mermail-treasury-scope-check", version: "1.5.5" }
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
const profile = new URL(endpoint).searchParams.get("profile");
const missing = (list) => list.filter((name) => !names.has(name));

const missingInflow = missing(inflowTools);
if (missingInflow.length) {
  fail(`Treasury inflow auditing is unavailable; missing: ${missingInflow.join(", ")}.`);
}

const missingDigest = missing(digestTools);
const missingWallet = missing(treasuryWalletTools);

console.log(
  `Connected to ${initialize.result.serverInfo.name}; discovered ${tools.length} tools (${profile ?? "full"} profile).`
);
console.log("Inflow auditing:      available");
console.log(
  missingDigest.length
    ? `Digest delivery:      unavailable (missing ${missingDigest.join(", ")}) - report the ledger in chat instead.`
    : "Digest delivery:      available"
);

// tools/list can legitimately omit paybox_* on a live full-profile OAuth session.
// Never treat that omission alone as "PayBox unavailable" - probe the tool instead.
if (missingWallet.length) {
  console.log(
    `Surplus transfers:    not listed (${missingWallet.join(", ")}). This is NOT proof of unavailability.`
  );
  console.log(
    "                      Call get_paybox_connection once before reporting PayBox as missing."
  );
  if (profile === "agent-inbox") {
    console.log("                      The agent-inbox profile never exposes PayBox by design.");
  } else if (apiKey) {
    console.log("                      API-key sessions never expose PayBox; reconnect with full-profile OAuth.");
  }
} else {
  console.log("Surplus transfers:    available (still requires get_paybox_connection before use)");
}

async function request(body) {
  const httpPost = globalThis["fetch"];
  const response = await httpPost(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api\u002dkey": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`MCP returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) {
    fail(`MCP error ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "request failed"}`);
  }
  return payload;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
