import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildMarginPacket } from "../skills/mermail-freelance-margin-guard/scripts/build-margin-packet.mjs";
import {
  buildFundingCovenant,
  observePublicSettlement,
  verifyFundingCovenant,
  verifyFundingGate,
  verifyPublicFundingReceipt,
  verifyPublicFundingReceiptLive,
} from "../skills/mermail-freelance-margin-guard/scripts/funding-gate.mjs";

const fixturePath = path.join(import.meta.dirname, "fixtures", "freelance-margin-guard.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const baseSepoliaFixturePath = path.join(
  import.meta.dirname,
  "fixtures",
  "funding-gate-base-sepolia.json",
);
const baseSepoliaFixture = JSON.parse(await readFile(baseSepoliaFixturePath, "utf8"));
const solanaDevnetFixturePath = path.join(
  import.meta.dirname,
  "fixtures",
  "funding-gate-solana-devnet.json",
);
const solanaDevnetFixture = JSON.parse(await readFile(solanaDevnetFixturePath, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const digest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const rehashDocument = (document, digestField) => {
  const changed = clone(document);
  const { integrity, ...payload } = changed;
  changed.integrity = { ...integrity, [digestField]: digest(payload) };
  return changed;
};
const packet = buildMarginPacket(clone(fixture));
const destination = "0x111111111111111111111111111111111111aBcD";
const token = "0x222222222222222222222222222222222222bCdE";
const transactionHash = `0x${"ab".repeat(32)}`;
const requestId = "paybox-request-fmg-001";
const terms = {
  optionId: "paid_change_order",
  price: { amount: "487.5", currency: "USD" },
  settlement: {
    chain: "base-sepolia",
    assetSymbol: "USDC",
    assetId: token,
    decimals: 6,
    amount: "487.5",
    destination,
  },
  conversion: { mode: "owner_fixed", sourceRef: "owner-settlement-approval" },
  binding: { mode: "public_transaction" },
  ownerApprovalRef: "owner-change-order-approval",
  ownerApprovedAt: "2026-09-22T10:00:00Z",
  policy: { minimumConfirmations: 2, validUntil: "2026-10-01T00:00:00Z" },
};
const covenant = buildFundingCovenant(packet, terms);
const rawAmount = 487500000n.toString(16).padStart(64, "0");
const rawDestination = covenant.settlement.destination.slice(2).padStart(64, "0");
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const baseRpcResults = {
  eth_chainId: "0x14a34",
  eth_getTransactionByHash: {
    hash: transactionHash,
    blockNumber: "0x64",
    from: "0x1111111111111111111111111111111111111111",
    to: covenant.settlement.assetId,
    value: "0x0",
    input: `0xa9059cbb${rawDestination}${rawAmount}`,
  },
  eth_getTransactionReceipt: {
    transactionHash,
    blockNumber: "0x64",
    status: "0x1",
    to: covenant.settlement.assetId,
    logs: [{
      address: covenant.settlement.assetId,
      topics: [transferTopic, `0x${"1".repeat(64)}`, `0x${rawDestination}`],
      data: `0x${rawAmount}`,
    }],
  },
  eth_blockNumber: "0x69",
  eth_getBlockByNumber: { timestamp: "0x6ab26dc0" },
  eth_call: `0x${"0".repeat(63)}6`,
};
const baseRpcCalls = [];
const baseFetch = async (_url, request) => {
  const { method, params } = JSON.parse(request.body);
  baseRpcCalls.push({
    method,
    params,
    redirect: request.redirect,
    hasAbortSignal: request.signal instanceof AbortSignal,
  });
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: baseRpcResults[method] }),
  };
};
const liveObservation = await observePublicSettlement(covenant, transactionHash, {
  rpcUrl: "https://rpc.example.test",
  fetchFn: baseFetch,
});
const evidence = { chain: liveObservation };
const recordedEvidence = { chain: clone(liveObservation) };
const providerTerms = clone(terms);
providerTerms.binding = { mode: "provider_request", expectedRequestId: requestId };
const providerCovenant = buildFundingCovenant(packet, providerTerms);
const providerEvidence = {
  provider: {
    source: "paybox_get_request",
    requestId,
    status: "settled",
    terminal: true,
    transactionHash,
  },
  chain: liveObservation,
};
const gateOptions = (targetCovenant, extra = {}) => ({
  approvedCovenantDigest: targetCovenant.integrity.covenantDigest,
  usedProofIds: [],
  ...extra,
});
const verifyGate = (targetPacket, targetCovenant, targetEvidence, extra = {}) =>
  verifyFundingGate(
    targetPacket,
    targetCovenant,
    targetEvidence,
    gateOptions(targetCovenant, extra),
  );
let checks = 0;

function check(name, fn) {
  fn();
  checks += 1;
  process.stdout.write(`ok ${checks} - ${name}\n`);
}

async function checkAsync(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`ok ${checks} - ${name}\n`);
}

check("builds a deterministic covenant bound to the exact margin packet", () => {
  assert.deepEqual(buildFundingCovenant(packet, clone(terms)), covenant);
  assert.equal(covenant.packetDigest, packet.integrity.packetDigest);
  assert.equal(covenant.settlement.amountAtomic, "487500000");
  assert.equal(covenant.settlement.destination, destination.toLowerCase());
  assert.equal(verifyFundingCovenant(covenant).valid, true);
});

check("accepts an exact finalized public receipt", () => {
  const result = verifyGate(packet, covenant, evidence);
  assert.equal(result.status, "FUNDED");
  assert.equal(result.fundingSatisfied, true);
  assert.equal(result.publicReceipt.status, "FUNDED");
  assert.match(result.publicReceipt.settlement.explorerUrl, /sepolia\.basescan\.org\/tx/);
});

check("keeps the public receipt free of email, project, and provider-request data", () => {
  const result = verifyGate(packet, covenant, evidence);
  const serialized = JSON.stringify(result.publicReceipt);
  assert.doesNotMatch(serialized, /Northstar Landing Page/);
  assert.doesNotMatch(serialized, new RegExp(requestId));
  assert.equal(result.publicReceipt.privacy.includesEmailContent, false);
  assert.equal(result.publicReceipt.privacy.includesProjectName, false);
  assert.match(result.publicReceipt.integrity.receiptDigest, /^[a-f0-9]{64}$/);
  const inspection = verifyPublicFundingReceipt(result.publicReceipt, {
    covenant,
    approvedCovenantDigest: covenant.integrity.covenantDigest,
  });
  assert.equal(inspection.selfConsistent, true);
  assert.equal(inspection.valid, false);
  assert.equal(inspection.requiresLiveVerification, true);
});

await checkAsync("authenticates a public receipt only by re-reading the live chain", async () => {
  const receipt = verifyGate(packet, covenant, evidence).publicReceipt;
  const verification = await verifyPublicFundingReceiptLive(receipt, covenant, {
    approvedCovenantDigest: covenant.integrity.covenantDigest,
    rpcUrl: "https://rpc.example.test",
    fetchFn: baseFetch,
  });
  assert.equal(verification.selfConsistent, true);
  assert.equal(verification.liveVerified, true);
  assert.equal(verification.valid, true);
  assert.deepEqual(verification.reasons, []);
});

await checkAsync("rejects a rehashed but nonexistent transaction receipt", async () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  const forgedHash = `0x${"cd".repeat(32)}`;
  changed.settlement.transactionHash = forgedHash;
  changed.settlement.explorerUrl = `https://sepolia.basescan.org/tx/${forgedHash}`;
  changed.proofId = digest({ chain: "base-sepolia", transactionHash: forgedHash });
  const rehashed = rehashDocument(changed, "receiptDigest");
  const inspection = verifyPublicFundingReceipt(rehashed, {
    covenant,
    approvedCovenantDigest: covenant.integrity.covenantDigest,
  });
  assert.equal(inspection.selfConsistent, true);
  assert.equal(inspection.valid, false);
  const verification = await verifyPublicFundingReceiptLive(rehashed, covenant, {
    approvedCovenantDigest: covenant.integrity.covenantDigest,
    rpcUrl: "https://rpc.example.test",
    fetchFn: baseFetch,
  });
  assert.equal(verification.valid, false);
  assert.match(verification.reasons.join(" "), /live public-chain verification failed/);
});

check("detects a public receipt changed after issuance", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.optionId = "forged-option";
  const verification = verifyPublicFundingReceipt(changed);
  assert.equal(verification.valid, false);
  assert.equal(verification.structureValid, true);
});

check("detects an explorer link substituted after issuance", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.settlement.explorerUrl = "https://example.test/forged";
  const verification = verifyPublicFundingReceipt(changed);
  assert.equal(verification.valid, false);
  assert.equal(verification.structureValid, false);
});

check("rejects a rehashed receipt whose proof id does not match the transaction", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.proofId = "0".repeat(64);
  const rehashed = rehashDocument(changed, "receiptDigest");
  const verification = verifyPublicFundingReceipt(rehashed);
  assert.equal(verification.valid, false);
  assert.equal(verification.structureValid, false);
});

check("rejects a rehashed receipt with inconsistent decimal and atomic amounts", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.settlement.amountAtomic = "1";
  const rehashed = rehashDocument(changed, "receiptDigest");
  const verification = verifyPublicFundingReceipt(rehashed);
  assert.equal(verification.valid, false);
  assert.equal(verification.structureValid, false);
});

check("rejects a rehashed receipt that changes its privacy declaration", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.privacy.includesEmailContent = true;
  const rehashed = rehashDocument(changed, "receiptDigest");
  const verification = verifyPublicFundingReceipt(rehashed);
  assert.equal(verification.valid, false);
  assert.equal(verification.structureValid, false);
});

check("requires the approved covenant to authenticate a self-consistent receipt", () => {
  const receipt = verifyGate(packet, covenant, evidence).publicReceipt;
  const withoutBinding = verifyPublicFundingReceipt(receipt);
  assert.equal(withoutBinding.structureValid, true);
  assert.equal(withoutBinding.bindingValid, false);
  assert.equal(withoutBinding.valid, false);
});

check("rejects a rehashed receipt whose option differs from its covenant", () => {
  const changed = clone(verifyGate(packet, covenant, evidence).publicReceipt);
  changed.optionId = "forged-option";
  const rehashed = rehashDocument(changed, "receiptDigest");
  const verification = verifyPublicFundingReceipt(rehashed, {
    covenant,
    approvedCovenantDigest: covenant.integrity.covenantDigest,
  });
  assert.equal(verification.structureValid, true);
  assert.equal(verification.bindingValid, false);
  assert.equal(verification.valid, false);
});

check("never treats funding evidence as authority to start work or move money", () => {
  const result = verifyGate(packet, covenant, evidence);
  assert.deepEqual(result.actionAuthority, {
    startWork: false,
    sendMessage: false,
    transferFunds: false,
    reason: "Funding evidence never replaces explicit owner approval for work, messaging, or money movement.",
  });
});

check("requires the exact owner-approved covenant digest", () => {
  const result = verifyFundingGate(packet, covenant, evidence, { usedProofIds: [] });
  assert.equal(result.status, "APPROVAL_REQUIRED");
  assert.equal(result.fundingSatisfied, false);
});

check("requires an explicit replay ledger even when no proofs were consumed", () => {
  const result = verifyFundingGate(packet, covenant, evidence, {
    approvedCovenantDigest: covenant.integrity.covenantDigest,
  });
  assert.equal(result.status, "REPLAY_STATE_REQUIRED");
  assert.equal(result.fundingSatisfied, false);
});

check("keeps a matching recorded observation non-authoritative", () => {
  const result = verifyGate(packet, covenant, recordedEvidence);
  assert.equal(result.status, "RECORDED_MATCH");
  assert.equal(result.fundingSatisfied, false);
  assert.equal(result.publicReceipt, null);
});

check("accepts a terminal provider binding only with the same live chain receipt", () => {
  const result = verifyGate(packet, providerCovenant, providerEvidence);
  assert.equal(result.status, "FUNDED");
  assert.match(result.publicReceipt.providerRequestCommitment, /^[a-f0-9]{64}$/);
});

check("rejects covenant tampering", () => {
  const changed = clone(covenant);
  changed.selection.price.amount = "500";
  const result = verifyGate(packet, changed, evidence);
  assert.equal(result.status, "MISMATCH");
  assert.equal(result.covenantValid, false);
});

check("rejects a rehashed covenant that differs from the approved digest", () => {
  const changed = clone(covenant);
  changed.selection.price.amount = "500";
  const rehashed = rehashDocument(changed, "covenantDigest");
  assert.equal(verifyFundingCovenant(rehashed).valid, true);
  const result = verifyFundingGate(packet, rehashed, evidence, {
    approvedCovenantDigest: covenant.integrity.covenantDigest,
    usedProofIds: [],
  });
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /owner-approved digest/);
});

check("red-team: rejects 1000 rehashed covenant and receipt substitutions", () => {
  const authenticReceipt = verifyGate(packet, covenant, evidence).publicReceipt;
  for (let index = 0; index < 500; index += 1) {
    const changedCovenant = clone(covenant);
    changedCovenant.ownerApproval.ref = `forged-approval-${index}`;
    const rehashedCovenant = rehashDocument(changedCovenant, "covenantDigest");
    const gate = verifyFundingGate(packet, rehashedCovenant, evidence, {
      approvedCovenantDigest: covenant.integrity.covenantDigest,
      usedProofIds: [],
    });
    assert.equal(gate.status, "MISMATCH");

    const changedReceipt = clone(authenticReceipt);
    changedReceipt.optionId = `forged-option-${index}`;
    const rehashedReceipt = rehashDocument(changedReceipt, "receiptDigest");
    const verification = verifyPublicFundingReceipt(rehashedReceipt, {
      covenant,
      approvedCovenantDigest: covenant.integrity.covenantDigest,
    });
    assert.equal(verification.valid, false);
  }
});

check("rejects a covenant attached to a tampered packet", () => {
  const changed = clone(packet);
  changed.marginSnapshot.completeTotalFeeRange.min = 1;
  const result = verifyGate(changed, covenant, evidence);
  assert.equal(result.status, "MISMATCH");
  assert.equal(result.packetValid, false);
});

check("keeps a pending provider request pending even when a tx hash exists", () => {
  const changed = clone(providerEvidence);
  changed.provider.status = "pending_signature";
  changed.provider.terminal = false;
  assert.equal(verifyGate(packet, providerCovenant, changed).status, "PENDING");
});

check("rejects invocation audit state as settlement authority", () => {
  const changed = clone(providerEvidence);
  changed.provider.source = "get_paybox_invocation";
  assert.throws(
    () => verifyGate(packet, providerCovenant, changed),
    /must be paybox_get_request/,
  );
});

check("rejects an email or screenshot claim as public-chain evidence", () => {
  const changed = clone(evidence);
  changed.chain.source = "client_email_screenshot";
  assert.throws(
    () => verifyGate(packet, covenant, changed),
    /must be public_chain_rpc/,
  );
});

check("detects partial funding with atomic-unit precision", () => {
  const changed = clone(evidence);
  changed.chain.amountAtomic = "487499999";
  assert.equal(verifyGate(packet, covenant, changed).status, "PARTIALLY_FUNDED");
});

check("requires review instead of silently accepting an overpayment", () => {
  const changed = clone(evidence);
  changed.chain.amountAtomic = "487500001";
  assert.equal(verifyGate(packet, covenant, changed).status, "OVERFUNDED_REVIEW");
});

check("rejects a destination mismatch", () => {
  const changed = clone(evidence);
  changed.chain.destination = "0x3333333333333333333333333333333333333333";
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /destination/);
});

check("rejects an asset-identity mismatch even when the ticker is unchanged", () => {
  const changed = clone(evidence);
  changed.chain.assetId = "0x4444444444444444444444444444444444444444";
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /asset identity/);
});

check("rejects a chain mismatch", () => {
  const changed = clone(evidence);
  changed.chain.chain = "base";
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.deepEqual(result.reasons, ["chain mismatch"]);
});

check("rejects a provider request that was not precommitted", () => {
  const changed = clone(providerEvidence);
  changed.provider.requestId = "paybox-request-substitution";
  const result = verifyGate(packet, providerCovenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /request id/);
});

check("rejects a provider receipt and chain receipt that point to different txs", () => {
  const changed = clone(providerEvidence);
  changed.chain.transactionHash = `0x${"cd".repeat(32)}`;
  const result = verifyGate(packet, providerCovenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /transaction hashes/);
});

check("blocks replay of a previously consumed transaction proof", () => {
  const first = verifyGate(packet, covenant, evidence);
  const replay = verifyGate(packet, covenant, evidence, { usedProofIds: [first.proofId] });
  assert.equal(replay.status, "REPLAY_BLOCKED");
  assert.equal(replay.fundingSatisfied, false);
});

check("rejects malformed entries in the consumed-proof ledger", () => {
  assert.throws(
    () => verifyGate(packet, covenant, evidence, { usedProofIds: ["not-a-proof"] }),
    /must be a proof digest/,
  );
});

check("requires the owner-selected confirmation threshold", () => {
  const changed = clone(evidence);
  changed.chain.confirmations = 1;
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "PENDING");
  assert.match(result.reasons.join(" "), /finality/);
});

check("rejects a historical transaction that predates owner approval", () => {
  const changed = clone(evidence);
  changed.chain.settledAt = "2026-09-22T09:59:59Z";
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /predates owner approval/);
});

check("rejects settlement after covenant expiry", () => {
  const changed = clone(evidence);
  changed.chain.settledAt = "2026-10-02T00:00:00Z";
  const result = verifyGate(packet, covenant, changed);
  assert.equal(result.status, "MISMATCH");
  assert.match(result.reasons.join(" "), /expiry/);
});

check("rejects a failed public-chain receipt", () => {
  const changed = clone(evidence);
  changed.chain.receiptStatus = "failed";
  assert.equal(verifyGate(packet, covenant, changed).status, "UNVERIFIED");
});

check("requires explicit owner conversion authority for USD to USDC", () => {
  const changed = clone(terms);
  delete changed.conversion;
  assert.throws(
    () => buildFundingCovenant(packet, changed),
    /owner_fixed conversion/,
  );
});

check("rejects a price outside the selected packet option", () => {
  const changed = clone(terms);
  changed.price.amount = "700";
  assert.throws(
    () => buildFundingCovenant(packet, changed),
    /inside the selected option fee range/,
  );
});

check("rejects an unpriced or zero-fee option as a funding covenant", () => {
  const changed = clone(terms);
  changed.optionId = "remove_or_swap";
  changed.price.amount = "0";
  assert.throws(() => buildFundingCovenant(packet, changed), /not fully priced|must be positive/);
});

check("rejects hidden precision beyond the asset decimals", () => {
  const changed = clone(terms);
  changed.settlement.amount = "487.5000001";
  assert.throws(() => buildFundingCovenant(packet, changed), /exceeds 6 decimal places/);
});

check("rejects a covenant that expires before owner approval", () => {
  const changed = clone(terms);
  changed.policy.validUntil = "2026-09-22T09:59:59Z";
  assert.throws(
    () => buildFundingCovenant(packet, changed),
    /must be after terms.ownerApprovedAt/,
  );
});

check("rejects ambiguous timestamps without an RFC 3339 timezone", () => {
  const changed = clone(terms);
  changed.ownerApprovedAt = "2026-09-22 10:00:00";
  assert.throws(
    () => buildFundingCovenant(packet, changed),
    /RFC 3339 timestamp with a timezone/,
  );
});

check("rejects a nonexistent calendar date instead of silently normalizing it", () => {
  const changed = clone(terms);
  changed.ownerApprovedAt = "2026-02-30T10:00:00Z";
  assert.throws(() => buildFundingCovenant(packet, changed), /invalid calendar date/);
});

check("rejects a Solana-looking address that does not decode to 32 bytes", () => {
  const changed = clone(terms);
  changed.settlement.chain = "devnet";
  changed.settlement.assetId = "native";
  changed.settlement.assetSymbol = "SOL";
  changed.settlement.decimals = 9;
  changed.settlement.amount = "1";
  changed.settlement.destination = "2".repeat(32);
  assert.throws(
    () => buildFundingCovenant(packet, changed),
    /must decode to 32 bytes/,
  );
});

await checkAsync("rejects an ERC-20 call with no matching Transfer event", async () => {
  const results = clone(baseRpcResults);
  results.eth_getTransactionReceipt.logs = [];
  const fetchFn = async (_url, request) => {
    const { method } = JSON.parse(request.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }),
    };
  };
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://rpc.example.test",
      fetchFn,
    }),
    /exactly one token Transfer event/,
  );
});

await checkAsync("rejects fee-on-transfer evidence when the event amount differs", async () => {
  const results = clone(baseRpcResults);
  results.eth_getTransactionReceipt.logs[0].data =
    `0x${(487499999n).toString(16).padStart(64, "0")}`;
  const fetchFn = async (_url, request) => {
    const { method } = JSON.parse(request.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }),
    };
  };
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://rpc.example.test",
      fetchFn,
    }),
    /calldata and Transfer event amounts differ/,
  );
});

await checkAsync("rejects a spoofed or removed ERC-20 Transfer event", async () => {
  for (const mutation of ["sender", "removed"]) {
    const results = clone(baseRpcResults);
    if (mutation === "sender") {
      results.eth_getTransactionReceipt.logs[0].topics[1] = `0x${"9".repeat(64)}`;
    } else {
      results.eth_getTransactionReceipt.logs[0].removed = true;
    }
    const fetchFn = async (_url, request) => {
      const { method } = JSON.parse(request.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }),
      };
    };
    await assert.rejects(
      observePublicSettlement(covenant, transactionHash, {
        rpcUrl: "https://rpc.example.test",
        fetchFn,
      }),
      /exact sender-bound ERC-20 Transfer event/,
    );
  }
});

await checkAsync("rejects an extra token Transfer event that cancels the recipient's net gain", async () => {
  const results = clone(baseRpcResults);
  results.eth_getTransactionReceipt.logs.push({
    address: covenant.settlement.assetId,
    topics: [
      transferTopic,
      `0x${rawDestination}`,
      `0x${"3".repeat(64)}`,
    ],
    data: `0x${(1n).toString(16).padStart(64, "0")}`,
  });
  const fetchFn = async (_url, request) => {
    const { method } = JSON.parse(request.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }),
    };
  };
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://rpc.example.test",
      fetchFn,
    }),
    /exactly one token Transfer event/,
  );
});

await checkAsync("rejects local and credential-bearing RPC endpoints", async () => {
  const noFetch = async () => assert.fail("blocked RPC URL must not be fetched");
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://127.0.0.1/rpc",
      fetchFn: noFetch,
    }),
    /private, reserved, or link-local/,
  );
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://user:secret@rpc.example.test",
      fetchFn: noFetch,
    }),
    /embedded credentials/,
  );
  for (const rpcUrl of [
    "https://[::1]/rpc",
    "https://[fc00::1]/rpc",
    "https://[::ffff:127.0.0.1]/rpc",
    "https://100.64.0.1/rpc",
  ]) {
    await assert.rejects(
      observePublicSettlement(covenant, transactionHash, { rpcUrl, fetchFn: noFetch }),
      /private, reserved, or link-local/,
    );
  }
  await assert.rejects(
    observePublicSettlement(covenant, transactionHash, {
      rpcUrl: "https://localhost./rpc",
      fetchFn: noFetch,
    }),
    /local hostname/,
  );
});

await checkAsync("reads and verifies an ERC-20 settlement directly from a Base RPC", async () => {
  assert.equal(liveObservation.amountAtomic, "487500000");
  assert.equal(liveObservation.destination, covenant.settlement.destination);
  assert.equal(liveObservation.confirmations, 6);
  const decimalsCall = baseRpcCalls.find((call) => call.method === "eth_call");
  assert.equal(decimalsCall.params[1], "0x64");
  assert.equal(baseRpcCalls.every((call) => call.redirect === "error"), true);
  assert.equal(baseRpcCalls.every((call) => call.hasAbortSignal), true);
  assert.equal(verifyGate(packet, covenant, evidence).status, "FUNDED");
});

await checkAsync("replays an independently inspectable Base Sepolia transaction corpus", async () => {
  const publicTerms = clone(terms);
  publicTerms.settlement = {
    chain: "base-sepolia",
    assetSymbol: "TEST",
    assetId: baseSepoliaFixture.transaction.to,
    decimals: 6,
    amount: "0.002527",
    destination: `0x${baseSepoliaFixture.transaction.input.slice(34, 74)}`,
  };
  publicTerms.conversion = {
    mode: "owner_fixed",
    sourceRef: "public-compatibility-fixture-only",
  };
  publicTerms.ownerApprovalRef = "public-compatibility-fixture-only";
  publicTerms.ownerApprovedAt = "2026-09-23T16:00:00Z";
  publicTerms.policy = { minimumConfirmations: 2, validUntil: "2026-09-24T00:00:00Z" };
  const publicCovenant = buildFundingCovenant(packet, publicTerms);
  const results = {
    eth_chainId: "0x14a34",
    eth_getTransactionByHash: baseSepoliaFixture.transaction,
    eth_getTransactionReceipt: baseSepoliaFixture.receipt,
    eth_blockNumber: baseSepoliaFixture.latestBlock,
    eth_getBlockByNumber: baseSepoliaFixture.block,
    eth_call: baseSepoliaFixture.decimals,
  };
  const calls = [];
  const fetchFn = async (_url, request) => {
    const { method, params } = JSON.parse(request.body);
    calls.push({ method, params });
    assert.notEqual(results[method], undefined, `unexpected RPC method ${method}`);
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: results[method] }),
    };
  };
  const observation = await observePublicSettlement(
    publicCovenant,
    baseSepoliaFixture.transaction.hash,
    { rpcUrl: baseSepoliaFixture.source.rpc, fetchFn },
  );
  assert.equal(observation.amountAtomic, "2527");
  assert.equal(observation.destination, publicCovenant.settlement.destination);
  assert.equal(observation.receiptStatus, "success");
  assert.equal(
    verifyGate(packet, publicCovenant, { chain: observation }).status,
    "FUNDED",
  );
  assert.deepEqual(
    [...new Set(calls.map(({ method }) => method))].sort(),
    [
      "eth_blockNumber",
      "eth_call",
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getTransactionByHash",
      "eth_getTransactionReceipt",
    ],
  );
});

await checkAsync("reads and verifies a finalized SPL-token settlement from Solana RPC", async () => {
  const solanaTerms = clone(terms);
  solanaTerms.settlement.chain = "devnet";
  solanaTerms.settlement.assetId = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  solanaTerms.settlement.destination = "9xQeWvG816bUx9EPfEZ4C3FJmK7x5hHkzYdZ8xF5HnG";
  solanaTerms.policy.minimumConfirmations = 1;
  const solanaCovenant = buildFundingCovenant(packet, solanaTerms);
  const signature = "3".repeat(88);
  const tokenAccount = "7".repeat(44);
  const transaction = {
    blockTime: 1790092800,
    meta: {
      err: null,
      innerInstructions: [],
      preTokenBalances: [{
        accountIndex: 1,
        owner: solanaCovenant.settlement.destination,
        mint: solanaCovenant.settlement.assetId,
        uiTokenAmount: { amount: "0", decimals: 6 },
      }],
      postTokenBalances: [{
        accountIndex: 1,
        owner: solanaCovenant.settlement.destination,
        mint: solanaCovenant.settlement.assetId,
        uiTokenAmount: { amount: "487500000", decimals: 6 },
      }],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [{ pubkey: "8".repeat(44) }, { pubkey: tokenAccount }],
        instructions: [{
          program: "spl-token",
          parsed: {
            type: "transferChecked",
            info: {
              destination: tokenAccount,
              mint: solanaCovenant.settlement.assetId,
              tokenAmount: { amount: "487500000", decimals: 6 },
            },
          },
        }],
      },
    },
  };
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: transaction }),
  });
  const observation = await observePublicSettlement(solanaCovenant, signature, {
    rpcUrl: "https://api.devnet.solana.com",
    fetchFn,
  });
  assert.equal(observation.finality, "finalized");
  assert.equal(observation.amountAtomic, "487500000");
  assert.equal(
    verifyGate(packet, solanaCovenant, { chain: observation }).status,
    "FUNDED",
  );
  transaction.transaction.message.instructions[0].parsed.info.mint = "So11111111111111111111111111111111111111112";
  await assert.rejects(
    observePublicSettlement(solanaCovenant, signature, {
      rpcUrl: "https://api.devnet.solana.com", fetchFn,
    }),
    /transferChecked mint does not match/,
  );
});

await checkAsync("rejects a Solana transfer followed by an outbound debit in the same transaction", async () => {
  const solanaTerms = clone(terms);
  solanaTerms.settlement = {
    chain: "devnet",
    assetSymbol: "TEST",
    assetId: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    decimals: 6,
    amount: "487.5",
    destination: "9xQeWvG816bUx9EPfEZ4C3FJmK7x5hHkzYdZ8xF5HnG",
  };
  solanaTerms.policy.minimumConfirmations = 1;
  const solanaCovenant = buildFundingCovenant(packet, solanaTerms);
  const signature = "3".repeat(88);
  const tokenAccount = "7".repeat(44);
  const transaction = {
    blockTime: 1790092800,
    meta: {
      err: null,
      preTokenBalances: [{ accountIndex: 1, owner: solanaCovenant.settlement.destination, mint: solanaCovenant.settlement.assetId, uiTokenAmount: { amount: "0", decimals: 6 } }],
      postTokenBalances: [{ accountIndex: 1, owner: solanaCovenant.settlement.destination, mint: solanaCovenant.settlement.assetId, uiTokenAmount: { amount: "487499999", decimals: 6 } }],
      innerInstructions: [],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [{ pubkey: "8".repeat(44) }, { pubkey: tokenAccount }],
        instructions: [{
          program: "spl-token",
          parsed: { type: "transferChecked", info: { destination: tokenAccount, mint: solanaCovenant.settlement.assetId, tokenAmount: { amount: "487500000", decimals: 6 } } },
        }],
      },
    },
  };
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: transaction }),
  });
  await assert.rejects(
    observePublicSettlement(solanaCovenant, signature, { rpcUrl: "https://api.devnet.solana.com", fetchFn }),
    /net balance increase/,
  );
});

await checkAsync("replays an independently inspectable Solana Devnet SPL transaction corpus", async () => {
  // The captured corpus omits preTokenBalances; reconstruct the prior balance for this
  // deterministic replay only. A real RPC observation must include both balance arrays.
  const transaction = clone(solanaDevnetFixture.transaction);
  const signature = transaction.transaction.signatures[0];
  const recipient = transaction.meta.postTokenBalances[0];
  transaction.meta.preTokenBalances = [{
    ...recipient,
    uiTokenAmount: {
      ...recipient.uiTokenAmount,
      amount: (BigInt(recipient.uiTokenAmount.amount) - 10000000n).toString(),
    },
  }];
  const publicTerms = clone(terms);
  publicTerms.settlement = {
    chain: "devnet",
    assetSymbol: "TEST",
    assetId: recipient.mint,
    decimals: 6,
    amount: "10",
    destination: recipient.owner,
  };
  publicTerms.conversion = {
    mode: "owner_fixed",
    sourceRef: "public-compatibility-fixture-only",
  };
  publicTerms.ownerApprovalRef = "public-compatibility-fixture-only";
  publicTerms.ownerApprovedAt = "2026-09-23T16:00:00Z";
  publicTerms.policy = { minimumConfirmations: 1, validUntil: "2026-09-24T00:00:00Z" };
  const publicCovenant = buildFundingCovenant(packet, publicTerms);
  const calls = [];
  const fetchFn = async (_url, request) => {
    const { method, params } = JSON.parse(request.body);
    calls.push({ method, params });
    assert.equal(method, "getTransaction");
    assert.equal(params[0], signature);
    assert.equal(params[1].commitment, "finalized");
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: transaction }),
    };
  };
  const observation = await observePublicSettlement(publicCovenant, signature, {
    rpcUrl: solanaDevnetFixture.source.rpc,
    fetchFn,
  });
  assert.equal(observation.amountAtomic, "10000000");
  assert.equal(observation.destination, publicCovenant.settlement.destination);
  assert.equal(observation.finality, "finalized");
  assert.equal(verifyGate(packet, publicCovenant, { chain: observation }).status, "FUNDED");
  assert.equal(calls.length, 1);
});

await checkAsync("accepts a finalized native SOL receipt only when net recipient balance rises exactly", async () => {
  const nativeTerms = clone(terms);
  nativeTerms.settlement = {
    chain: "devnet", assetSymbol: "SOL", assetId: "native", decimals: 9,
    amount: "1", destination: "9xQeWvG816bUx9EPfEZ4C3FJmK7x5hHkzYdZ8xF5HnG",
  };
  nativeTerms.policy.minimumConfirmations = 1;
  const nativeCovenant = buildFundingCovenant(packet, nativeTerms);
  const signature = "3".repeat(88);
  const transaction = {
    blockTime: 1790092800,
    meta: {
      err: null, innerInstructions: [], preBalances: [2000000000, 100000000],
      postBalances: [999995000, 1100000000],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [{ pubkey: "8".repeat(44) }, { pubkey: nativeCovenant.settlement.destination }],
        instructions: [{
          program: "system", parsed: {
            type: "transfer", info: { destination: nativeCovenant.settlement.destination, lamports: 1000000000 },
          },
        }],
      },
    },
  };
  const fetchFn = async () => ({
    ok: true, status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: transaction }),
  });
  const observation = await observePublicSettlement(nativeCovenant, signature, {
    rpcUrl: "https://api.devnet.solana.com", fetchFn,
  });
  assert.equal(observation.amountAtomic, "1000000000");
  assert.equal(verifyGate(packet, nativeCovenant, { chain: observation }).status, "FUNDED");
  transaction.meta.postBalances[1] -= 1;
  await assert.rejects(
    observePublicSettlement(nativeCovenant, signature, {
      rpcUrl: "https://api.devnet.solana.com", fetchFn,
    }),
    /SOL transfer amount differs from recipient net balance increase/,
  );
});

await checkAsync("rejects an unsafe numeric lamport amount from Solana RPC", async () => {
  const nativeTerms = clone(terms);
  nativeTerms.settlement = {
    chain: "devnet",
    assetSymbol: "SOL",
    assetId: "native",
    decimals: 9,
    amount: "1",
    destination: "9xQeWvG816bUx9EPfEZ4C3FJmK7x5hHkzYdZ8xF5HnG",
  };
  nativeTerms.policy.minimumConfirmations = 1;
  const nativeCovenant = buildFundingCovenant(packet, nativeTerms);
  const signature = "3".repeat(88);
  const transaction = {
    blockTime: 1790092800,
    meta: { err: null, innerInstructions: [], postTokenBalances: [] },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [],
        instructions: [{
          program: "system",
          parsed: {
            type: "transfer",
            info: {
              destination: nativeCovenant.settlement.destination,
              lamports: Number.MAX_SAFE_INTEGER + 1,
            },
          },
        }],
      },
    },
  };
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: transaction }),
  });
  await assert.rejects(
    observePublicSettlement(nativeCovenant, signature, {
      rpcUrl: "https://api.devnet.solana.com",
      fetchFn,
    }),
    /safe unsigned integer/,
  );
});

process.stdout.write(`Validated ${checks} Funding Gate checks.\n`);
