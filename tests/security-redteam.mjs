import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildMarginPacket, verifyMarginPacket } from "../skills/mermail-freelance-margin-guard/scripts/build-margin-packet.mjs";
import { buildFundingCovenant, observePublicSettlement, verifyFundingGate, verifyPublicFundingReceiptLive } from "../skills/mermail-freelance-margin-guard/scripts/funding-gate.mjs";
import { LIVE_BASELINE_BODY, LIVE_REQUEST_BODY, buildLiveMarginInput, resolveSelectedEmailEvidence } from "../skills/mermail-freelance-margin-guard/scripts/run-live-proof.mjs";

// All transports, credentials, approvals and balances below are synthetic.
// No live service call, email send, wallet action or external publish is allowed.
const root = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(await readFile(path.join(import.meta.dirname, "fixtures/freelance-margin-guard.json"), "utf8"));
const base = JSON.parse(await readFile(path.join(import.meta.dirname, "fixtures/funding-gate-base-sepolia.json"), "utf8"));
const clone = (value) => structuredClone(value);
const packet = buildMarginPacket(clone(fixture));
const genesis = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  testnet: "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",
};
const terms = {
  optionId: "paid_change_order", price: { amount: "487.5", currency: "USD" },
  settlement: {
    chain: "base-sepolia", assetSymbol: "TEST", assetId: base.transaction.to, decimals: 6,
    amount: "0.002527", destination: `0x${base.transaction.input.slice(34, 74)}`,
  },
  conversion: { mode: "owner_fixed", sourceRef: "synthetic-owner-conversion" },
  binding: { mode: "public_transaction" }, ownerApprovalRef: "synthetic-owner-approval",
  ownerApprovedAt: "2026-09-23T16:00:00Z", policy: { minimumConfirmations: 2, validUntil: "2026-10-01T00:00:00Z" },
};
const baseCovenant = buildFundingCovenant(packet, terms);
const baseResults = () => ({
  eth_chainId: "0x14a34", eth_getTransactionByHash: clone(base.transaction),
  eth_getTransactionReceipt: clone(base.receipt), eth_getBlockByNumber: clone(base.block),
  eth_blockNumber: base.latestBlock, eth_call: base.decimals,
});
const mockRpc = (results, calls = []) => async (_url, options) => {
  const { method, params } = JSON.parse(options.body);
  calls.push({ method, params });
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
  return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }) };
};
const observeBase = (results) => observePublicSettlement(baseCovenant, base.transaction.hash, {
  rpcUrl: "https://rpc.example.test", fetchFn: mockRpc(results),
});
const gate = (covenant, observation) => verifyFundingGate(packet, covenant, { chain: observation }, {
  approvedCovenantDigest: covenant.integrity.covenantDigest, usedProofIds: [],
});

test("canonical public Base corpus retains a valid strictly bound positive path", async () => {
  const observation = await observeBase(baseResults());
  assert.equal(gate(baseCovenant, observation).status, "FUNDED");
  assert.equal(gate(baseCovenant, observation).actionAuthority.startWork, false);
  assert.equal(gate(baseCovenant, observation).actionAuthority.sendMessage, false);
  assert.equal(gate(baseCovenant, observation).actionAuthority.transferFunds, false);
});

for (const [label, mutate, reason] of [
  ["orphaned canonical block", (r) => { r.eth_getBlockByNumber.hash = `0x${"ee".repeat(32)}`; }, /canonical block/],
  ["inconsistent transaction block hash", (r) => { r.eth_getTransactionByHash.blockHash = `0x${"ee".repeat(32)}`; }, /canonical block/],
  ["inconsistent receipt block hash", (r) => { r.eth_getTransactionReceipt.blockHash = `0x${"ee".repeat(32)}`; }, /canonical block/],
  ["missing receipt block hash", (r) => { delete r.eth_getTransactionReceipt.blockHash; }, /blockHash/],
  ["wrong canonical height", (r) => { r.eth_getBlockByNumber.number = "0x1"; }, /block number/],
  ["missing canonical transaction membership", (r) => { r.eth_getBlockByNumber.transactions = []; }, /include the selected transaction/],
  ["log from another block", (r) => { r.eth_getTransactionReceipt.logs[0].blockHash = `0x${"ee".repeat(32)}`; }, /sender-bound/],
  ["log from another transaction", (r) => { r.eth_getTransactionReceipt.logs[0].transactionHash = `0x${"ee".repeat(32)}`; }, /sender-bound/],
  ["noncanonical calldata address padding", (r) => { r.eth_getTransactionByHash.input = r.eth_getTransactionByHash.input.slice(0, 10) + "1" + r.eth_getTransactionByHash.input.slice(11); }, /address padding/],
  ["noncanonical log address padding", (r) => { r.eth_getTransactionReceipt.logs[0].topics[2] = "0x1" + r.eth_getTransactionReceipt.logs[0].topics[2].slice(3); }, /sender-bound/],
]) {
  test(`rejects ${label}`, async () => {
    const results = baseResults(); mutate(results);
    await assert.rejects(observeBase(results), reason);
  });
}

test("same-asset price cannot be replaced by a smaller or larger settlement, with or without a mode", () => {
  const input = clone(fixture); input.baseline.pricing.currency = "USDC";
  const samePacket = buildMarginPacket(input);
  for (const amount of ["0.002527", "487.499999", "487.500001", "1000"]) {
    for (const explicitMode of [true, false]) {
      const changed = clone(terms);
      changed.price.currency = changed.settlement.assetSymbol = "USDC";
      changed.settlement.amount = amount;
      if (explicitMode) changed.conversion = { mode: "same_asset" }; else delete changed.conversion;
      assert.throws(() => buildFundingCovenant(samePacket, changed), /same-asset settlement amount must equal/);
    }
  }
  const valid = clone(terms);
  valid.price.currency = valid.settlement.assetSymbol = "USDC";
  valid.settlement.amount = "487.500000"; valid.conversion = { mode: "same_asset" };
  assert.equal(buildFundingCovenant(samePacket, valid).settlement.amountAtomic, "487500000");
});

function solanaCase(cluster = "devnet") {
  const changed = clone(terms);
  changed.settlement = {
    chain: cluster, assetSymbol: "TEST", assetId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    decimals: 6, amount: "487.5", destination: "9xQeWvG816bUx9EPfEZ4C3FJmK7x5hHkzYdZ8xF5HnG",
  };
  changed.ownerApprovedAt = "2026-09-22T10:00:00Z";
  changed.policy.minimumConfirmations = 1;
  const covenant = buildFundingCovenant(packet, changed);
  const signature = "3".repeat(88), account = "7".repeat(44);
  const balance = (index, amount) => ({ accountIndex: index, owner: changed.settlement.destination,
    mint: changed.settlement.assetId, uiTokenAmount: { amount, decimals: 6 } });
  const transaction = {
    blockTime: 1790092800,
    meta: { err: null, innerInstructions: [], preTokenBalances: [balance(1, "0")], postTokenBalances: [balance(1, "487500000")] },
    transaction: { signatures: [signature], message: {
      accountKeys: [{ pubkey: "8".repeat(44) }, { pubkey: account }, { pubkey: "6".repeat(44) }],
      instructions: [{ program: "spl-token", parsed: { type: "transferChecked", info: {
        destination: account, mint: changed.settlement.assetId, tokenAmount: { amount: "487500000", decimals: 6 },
      } } }],
    } },
  };
  return { covenant, signature, transaction, balance };
}

test("all three Solana cluster identities have positive controls and reject every other cluster", async () => {
  for (const selected of Object.keys(genesis)) {
    const { covenant, signature, transaction } = solanaCase(selected);
    for (const actual of Object.keys(genesis)) {
      const calls = [], fetchFn = mockRpc({ getGenesisHash: genesis[actual], getTransaction: transaction }, calls);
      const operation = observePublicSettlement(covenant, signature, { rpcUrl: "https://rpc.example.test", fetchFn });
      if (selected === actual) {
        assert.equal(gate(covenant, await operation).status, "FUNDED");
        assert.deepEqual(calls.map((call) => call.method), ["getGenesisHash", "getTransaction"]);
      } else {
        await assert.rejects(operation, /Solana cluster does not match/);
        assert.deepEqual(calls.map((call) => call.method), ["getGenesisHash"]);
      }
    }
  }
});

test("receipt reauthentication also rejects a wrong Solana cluster", async () => {
  const { covenant, signature, transaction } = solanaCase("mainnet-beta");
  const observation = await observePublicSettlement(covenant, signature, {
    rpcUrl: "https://rpc.example.test", fetchFn: mockRpc({ getGenesisHash: genesis["mainnet-beta"], getTransaction: transaction }),
  });
  const result = await verifyPublicFundingReceiptLive(gate(covenant, observation).publicReceipt, covenant, {
    approvedCovenantDigest: covenant.integrity.covenantDigest, rpcUrl: "https://rpc.example.test",
    fetchFn: mockRpc({ getGenesisHash: genesis.devnet, getTransaction: transaction }),
  });
  assert.equal(result.valid, false); assert.equal(result.liveVerified, false);
});

test("SPL recipient aggregate rejects offsetting debits and self-transfer across different owned accounts", async () => {
  for (const closedAccount of [false, true]) {
    const { covenant, signature, transaction, balance } = solanaCase();
    transaction.meta.preTokenBalances.push(balance(2, "487500000"));
    if (!closedAccount) transaction.meta.postTokenBalances.push(balance(2, "0"));
    await assert.rejects(observePublicSettlement(covenant, signature, {
      rpcUrl: "https://rpc.example.test", fetchFn: mockRpc({ getGenesisHash: genesis.devnet, getTransaction: transaction }),
    }), /recipient net balance increase/);
  }
});

test("RPC response envelope cannot be substituted", async () => {
  await assert.rejects(observePublicSettlement(baseCovenant, base.transaction.hash, {
    rpcUrl: "https://rpc.example.test",
    fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 999, result: "0x14a34" }) }),
  }), /invalid envelope/);
});

test("partially overlapping delay evidence cannot count one event twice", () => {
  const changed = clone(fixture), original = changed.dependencies[0];
  changed.dependencies = [
    { ...original, evidenceQuote: "credentials were supplied two days" },
    { ...original, id: "second-delay", evidenceQuote: "supplied two days after the agreed access date" },
  ];
  assert.throws(() => buildMarginPacket(changed), /duplicate or overlapping evidence/);
});

test("disjoint delay events from one email remain valid", () => {
  const changed = clone(fixture), original = changed.dependencies[0];
  changed.sources.find((source) => source.id === original.sourceRef).quote += " Review feedback arrived three days late.";
  changed.dependencies.push({ ...original, id: "second-delay", delayDays: 3, evidenceQuote: "Review feedback arrived three days late" });
  const result = buildMarginPacket(changed);
  assert.equal(result.delayAttribution.totalDaysByOwner.client, 5);
});

test("ambiguous repeated evidence requires an unambiguous quotation", () => {
  const changed = clone(fixture), original = changed.dependencies[0];
  changed.sources.find((source) => source.id === original.sourceRef).quote += " Another note: supplied two days after.";
  assert.throws(() => buildMarginPacket(changed), /ambiguous repeated evidence/);
});

function selectedEmail(id = "synthetic-baseline", body = LIVE_BASELINE_BODY) {
  return { id, body, date: "2026-09-29T12:00:00Z", folder_id: "Inbox", scan_status: "clean",
    agent_safe_content: true, content_omitted: false, content_truncated: false };
}

for (const [label, mutate] of [
  ["wrong resource id", (email) => { email.id = "other-email"; }],
  ["unsafe projection", (email) => { email.agent_safe_content = false; }],
  ["malicious scan", (email) => { email.scan_status = "malicious"; }],
  ["missing scan", (email) => { delete email.scan_status; }],
  ["omitted body", (email) => { email.content_omitted = true; }],
  ["truncated body", (email) => { email.content_truncated = true; }],
  ["body longer than bound", (email) => { email.body += "x".repeat(10001); }],
  ["empty selected body with unrelated metadata", (email) => { email.body = ""; }],
  ["missing selected date", (email) => { delete email.date; }],
  ["timezone ambiguous date", (email) => { email.date = "2026-09-29T12:00:00"; }],
  ["invalid calendar date", (email) => { email.date = "2026-02-30T12:00:00Z"; }],
]) {
  test(`live proof rejects ${label}`, () => {
    const email = selectedEmail(); mutate(email);
    assert.throws(() => resolveSelectedEmailEvidence([{ email, unrelated_note: LIVE_BASELINE_BODY }], "synthetic-baseline", ["one responsive landing page"]));
  });
}

test("conflicting duplicate selected projections are rejected", () => {
  const safe = selectedEmail(), unsafe = { ...safe, scan_status: "malicious" };
  assert.throws(() => resolveSelectedEmailEvidence([{ email: safe }, { email: unsafe }], safe.id, []), /identity/);
  assert.equal(resolveSelectedEmailEvidence([{ email: safe }, { email: clone(safe) }], safe.id, []).email.id, safe.id);
  const reordered = Object.fromEntries(Object.entries(safe).reverse());
  assert.equal(resolveSelectedEmailEvidence([{ email: safe }, { email: reordered }], safe.id, []).email.id, safe.id);
});

test("live packet uses the captured selected bodies and rejects a changed baseline", () => {
  const input = buildLiveMarginInput({ baselineMessageId: "synthetic-baseline", requestMessageId: "synthetic-request", baselineDate: "2026-09-29", requestDate: "2026-09-29" });
  const receipts = [
    resolveSelectedEmailEvidence([{ email: selectedEmail() }], "synthetic-baseline", []),
    resolveSelectedEmailEvidence([{ email: selectedEmail("synthetic-request", LIVE_REQUEST_BODY) }], "synthetic-request", []),
  ];
  assert.equal(verifyMarginPacket(buildMarginPacket(input, { observedEmails: receipts })).valid, true);
  receipts[0].email.body = "one responsive landing page; two revision rounds; admin dashboard; 2026-10-20. Different agreement.";
  assert.throws(() => buildMarginPacket(input, { observedEmails: receipts }), /contiguous verbatim excerpt/);
});

test("null-scan Sent evidence requires safe context and never admits an incoming message", () => {
  const email = { ...selectedEmail(), folder_id: "Sent", scan_status: null, is_incoming: false };
  assert.throws(() => resolveSelectedEmailEvidence([{ email }], email.id, []), /security/);
  assert.equal(resolveSelectedEmailEvidence([{ email }], email.id, [], "get_email_context").tool, "get_email_context");
  email.is_incoming = true;
  assert.throws(() => resolveSelectedEmailEvidence([{ email }], email.id, [], "get_email_context"), /security/);
});

test("thread entries cannot replace an absent or mismatched primary selected email", () => {
  const selected = selectedEmail(), wrong = { ...selected, id: "unselected-email" };
  for (const tool of ["get_email", "get_email_context"]) {
    assert.throws(() => resolveSelectedEmailEvidence([
      { email: wrong, thread: { messages: [selected] } },
    ], selected.id, [], tool), /identity/);
    assert.equal(resolveSelectedEmailEvidence([
      { email: selected, thread: { messages: [wrong] } },
    ], selected.id, [], tool).email.id, selected.id);
    for (const missing of [
      { thread: { messages: [{ email: selected }] } },
      { data: { thread: { messages: [{ email: selected }] } } },
      { email: null, data: { email: selected } },
      { data: { result: { data: { result: { email: selected } } } } },
    ]) assert.throws(() => resolveSelectedEmailEvidence([missing], selected.id, [], tool), /identity/);
    for (const wrapped of [
      { data: { email: selected } },
      { result: { data: { email: selected } } },
    ]) assert.equal(resolveSelectedEmailEvidence([wrapped], selected.id, [], tool).email.id, selected.id);
  }
});

const temporary = await mkdtemp(path.join(os.tmpdir(), "mermail-security-"));
const dummyKey = ["sk", "proj", "synthetic", "offline", "only"].join("-");
const preloadPath = path.join(temporary, "mcp-mock.mjs");
const callsPath = path.join(temporary, "calls.json");
await writeFile(preloadPath, `
import { writeFileSync } from "node:fs";
const calls = [], mode = process.env.MOCK_CASE;
const names = ${JSON.stringify(["get_api_credit_usage", "list_workspaces", "get_workspace", "list_email_domains", "list_workspace_mailboxes", "list_mailboxes", "create_mailbox", "get_mailbox", "list_emails", "search_emails", "get_email", "get_email_context"])};
globalThis.fetch = async (url, options) => {
  calls.push({url: String(url), redirect: options.redirect, hasSignal: options.signal instanceof AbortSignal});
  if (String(url) !== "https://console.mermail.app/mcp?profile=agent-inbox") throw new Error("External target denied");
  if (mode === "redirect") {
    if (options.redirect !== "error") calls.push({url: "https://redirect-sink.example.test", dummyCredentialForwarded: true});
    throw new Error("Redirect blocked");
  }
  if (mode === "network-error") throw new Error(process.env.MERMAIL_API_KEY);
  const body = JSON.parse(options.body);
  const payload = {jsonrpc: "2.0", id: mode === "envelope" ? 999 : body.id};
  if (mode === "reflected-error") payload.error = {code: -32001, message: process.env.MERMAIL_API_KEY};
  else payload.result = body.method === "initialize" ? {serverInfo: {name: process.env.MERMAIL_API_KEY}} : {tools: names.map(name => ({name}))};
  return {ok: true, status: 200, json: async () => payload};
};
process.on("exit", () => writeFileSync(process.env.MOCK_CALLS_PATH, JSON.stringify(calls)));
`);
function connection(mode, endpoint = "https://console.mermail.app/mcp?profile=agent-inbox") {
  const result = spawnSync(process.execPath, ["--import", preloadPath, path.join(root, "skills/mermail-mcp/scripts/check-connection.mjs")], {
    encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH, MERMAIL_API_KEY: dummyKey,
      MERMAIL_MCP_URL: endpoint, MOCK_CASE: mode, MOCK_CALLS_PATH: callsPath },
  });
  assert.ifError(result.error);
  assert.ok(!(result.stdout + result.stderr).includes(dummyKey), "diagnostic leaked the synthetic credential");
  return result;
}
test("MCP success never prints an untrusted server name or reflected credential", () => {
  const result = connection("success");
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /discovered 12 tools/);
});
for (const mode of ["redirect", "network-error", "reflected-error", "envelope"]) {
  test(`MCP ${mode} stops safely before tool execution`, async () => {
    assert.equal(connection(mode).status, 1);
    const calls = JSON.parse(await readFile(callsPath, "utf8"));
    assert.equal(calls.length, 1); assert.equal(calls[0].redirect, "error"); assert.equal(calls[0].hasSignal, true);
  });
}
test("MCP endpoint/profile rejection happens before transmitting a credential", async () => {
  for (const endpoint of ["http://127.0.0.1/mcp", "https://attacker.example.test/mcp", "https://user:pass@console.mermail.app/mcp", "https://console.mermail.app/mcp#fragment", "https://console.mermail.app/mcp?profile=unsupported", "https://console.mermail.app/mcp?profile=agent-inbox&profile=agent-inbox", "https://console.mermail.app/mcp?redirect=other"]) {
    assert.equal(connection("success", endpoint).status, 1);
    assert.deepEqual(JSON.parse(await readFile(callsPath, "utf8")), []);
  }
});

const livePreload = path.join(temporary, "live-mock.mjs");
await writeFile(livePreload, `
import { writeFileSync } from "node:fs";
const calls = [], mode = process.env.MOCK_CASE;
const baseline = ${JSON.stringify(LIVE_BASELINE_BODY)}, change = ${JSON.stringify(LIVE_REQUEST_BODY)};
const metadata = [
  {id:"synthetic-baseline",subject:"[FMG-LIVE-security] Accepted scope",folder_id:"Inbox",date:"2026-09-29T12:00:00Z"},
  {id:"synthetic-request",subject:"[FMG-LIVE-security] Change request",folder_id:"Inbox",date:"2026-09-29T12:00:00Z"},
];
if (mode.startsWith("sent")) metadata.forEach(email => {email.folder_id = "Sent";});
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://console.mermail.app/mcp") throw new Error("External target denied");
  if (options.redirect !== "error" || !(options.signal instanceof AbortSignal)) throw new Error("Missing transport boundary");
  const rpc = JSON.parse(options.body); calls.push({method:rpc.method,params:rpc.params});
  let result;
  if (rpc.method === "initialize") result = {serverInfo:{name:"offline-controlled"}};
  else if (rpc.method === "tools/list") result = {tools:["list_mailboxes","list_emails","search_emails","get_email","get_email_context"].map(name=>({name}))};
  else if (rpc.method === "tools/call") {
    const {name, arguments:args} = rpc.params;
    if (name === "list_mailboxes") result = {structuredContent:{items:[{public_id:"synthetic-mailbox",email:"fixture@example.test",status:"ready"}]}};
    else if (["list_emails","search_emails"].includes(name)) result = {structuredContent:{items:metadata}};
    else if (["get_email","get_email_context"].includes(name)) {
      const body = args.emailId === "synthetic-baseline" ? baseline : change;
      const email = {id:args.emailId,date:"2026-09-29T12:00:00Z",body,folder_id:"Inbox",scan_status:"clean",agent_safe_content:true,content_omitted:false,content_truncated:false};
      if (mode.startsWith("sent")) Object.assign(email,{folder_id:"Sent",scan_status:null,is_incoming:false});
      if (mode === "unsafe") Object.assign(email,{id:"wrong-email",body:"",scan_status:"malicious",agent_safe_content:false,content_omitted:true,content_truncated:true});
      if (mode === "changed-baseline" && args.emailId === "synthetic-baseline") email.body = "one responsive landing page; two revision rounds; admin dashboard; 2026-10-20. Different agreement.";
      result = {structuredContent:{email,unrelated_note:body}};
      if (mode === "sent-nested") result = {structuredContent:{thread:{messages:[{email}]}}};
    } else throw new Error("External mutation or unknown operation denied");
  } else throw new Error("Unknown RPC denied");
  return {ok:true,status:200,json:async()=>({jsonrpc:"2.0",id:rpc.id,result})};
};
process.on("exit",()=>writeFileSync(process.env.MOCK_CALLS_PATH,JSON.stringify(calls)));
`);
for (const mode of ["valid", "sent", "unsafe", "changed-baseline", "sent-nested"]) {
  test(`actual live-proof CLI ${mode} follows selected safe reads and never sends`, async () => {
    const result = spawnSync(process.execPath, ["--import", livePreload,
      path.join(root, "skills/mermail-freelance-margin-guard/scripts/run-live-proof.mjs"), "--seed-and-prove"], {
      encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH, MERMAIL_API_KEY: dummyKey,
        MERMAIL_LIVE_RESUME: "1", MERMAIL_LIVE_RUN_TAG: "security", MERMAIL_LIVE_MAILBOX_ID: "synthetic-mailbox",
        MOCK_CASE: mode, MOCK_CALLS_PATH: callsPath },
    });
    assert.ifError(result.error);
    const positive = ["valid", "sent"].includes(mode);
    assert.equal(result.status, positive ? 0 : 1, result.stderr);
    assert.equal(result.stdout.includes("Live Mermail Margin Guard proof passed"), positive);
    assert.ok(!(result.stdout + result.stderr).includes(dummyKey));
    const calls = JSON.parse(await readFile(callsPath, "utf8"));
    const reads = calls.filter((call) => ["get_email","get_email_context"].includes(call.params?.name));
    assert.equal(reads.length, ["unsafe", "sent-nested"].includes(mode) ? 1 : 2);
    for (const read of reads) {
      if (mode.startsWith("sent")) {
        assert.equal(read.params.name, "get_email_context");
        assert.deepEqual(read.params.arguments.query, { limit: 1 });
      }
      else assert.deepEqual(read.params.arguments.query, {
        require_scan_status: "clean", agent_safe_content: true, max_body_chars: 10000,
      });
    }
    assert.equal(calls.some((call) => /send|reply|draft|paybox|wallet/.test(call.params?.name ?? "")), false);
  });
}

test("1000 seeded numeric and hostile-text scenarios keep integrity and bounded ordered money ranges", () => {
  let seed = 0x1245e79;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let index = 0; index < 1000; index += 1) {
    const input = clone(fixture);
    input.baseline.pricing.rate.amount = Math.round(random() * 1000000) / 10000;
    input.baseline.pricing.rushPremium.percent = Math.floor(random() * 100);
    input.project.name = `<script>alert(${index})</script> [x](javascript:alert(1)) \u202e ${index}`;
    for (const item of input.request.items.filter((item) => item.effortHours)) {
      const min = Math.floor(random() * 400) / 10;
      item.effortHours = { ...item.effortHours, min, max: min + Math.floor(random() * 400) / 10 };
    }
    const result = buildMarginPacket(input);
    assert.equal(verifyMarginPacket(result).valid, true);
    for (const option of result.clientOptions.filter((option) => option.feeRange)) {
      assert.ok(Number.isFinite(option.feeRange.min) && option.feeRange.min >= 0);
      assert.ok(Number.isFinite(option.feeRange.max) && option.feeRange.max >= option.feeRange.min);
    }
  }
});

test.after(async () => { await rm(temporary, { recursive: true, force: true }); });
