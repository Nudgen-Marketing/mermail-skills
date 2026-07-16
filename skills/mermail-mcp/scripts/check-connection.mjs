#!/usr/bin/env node
import process from "node:process";

const endpoint = process.env.MERMAIL_MCP_URL || "https://console.mermail.app/mcp";
const apiKey = process.env.MERMAIL_API_KEY;

if (!apiKey) fail("MERMAIL_API_KEY is not set in this process environment.");
if (!apiKey.startsWith("sk-proj-") || apiKey.length < 20) fail("MERMAIL_API_KEY has an invalid format.");

const initialize = await request({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mermail-skill-check", version: "1.2.1" }
  }
});

if (!initialize.result?.serverInfo) fail("MCP initialize did not return serverInfo.");

const listed = await request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
const tools = listed.result?.tools;
if (!Array.isArray(tools)) fail("MCP tools/list did not return a tools array.");
if (tools.length !== 63) fail(`Expected 63 tools but discovered ${tools.length}.`);

console.log(`Connected to ${initialize.result.serverInfo.name}; discovered ${tools.length} tools.`);

async function request(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) fail(`MCP returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) fail(`MCP error ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "request failed"}`);
  return payload;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
