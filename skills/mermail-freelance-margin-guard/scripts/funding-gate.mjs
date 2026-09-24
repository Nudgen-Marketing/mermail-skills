#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { verifyMarginPacket } from "./build-margin-packet.mjs";

const CHAINS = new Map([
  ["base", { family: "evm", chainId: 8453n, explorer: "https://basescan.org/tx/" }],
  ["base-sepolia", { family: "evm", chainId: 84532n, explorer: "https://sepolia.basescan.org/tx/" }],
  ["mainnet-beta", { family: "solana", explorer: "https://explorer.solana.com/tx/" }],
  ["devnet", { family: "solana", explorer: "https://explorer.solana.com/tx/", query: "?cluster=devnet" }],
  ["testnet", { family: "solana", explorer: "https://explorer.solana.com/tx/", query: "?cluster=testnet" }],
]);
const SUCCESS_STATUSES = new Set(["completed", "settled", "succeeded", "success"]);
const PENDING_STATUSES = new Set([
  "created",
  "pending",
  "pending_approval",
  "pending_execution",
  "pending_signature",
  "processing",
  "submitted",
]);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LIVE_RPC_OBSERVATIONS = new WeakSet();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value, label) {
  invariant(isObject(value), `${label} must be an object`);
  return value;
}

function array(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value;
}

function textValue(value, label, max = 500) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string`);
  const result = value.trim();
  invariant(result.length <= max, `${label} exceeds ${max} characters`);
  return result;
}

function integer(value, label, { min = 0, max = 1_000_000 } = {}) {
  invariant(Number.isInteger(value), `${label} must be an integer`);
  invariant(value >= min && value <= max, `${label} must be between ${min} and ${max}`);
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function base58ByteLength(value, label) {
  let decoded = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    invariant(digit >= 0, `${label} must be base58`);
    decoded = decoded * 58n + BigInt(digit);
  }
  let leadingZeroBytes = 0;
  while (value[leadingZeroBytes] === "1") leadingZeroBytes += 1;
  const decodedBytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(16).length / 2);
  return leadingZeroBytes + decodedBytes;
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function normalizeChain(value, label = "chain") {
  const chain = textValue(value, label, 40).toLowerCase();
  invariant(CHAINS.has(chain), `${label} is unsupported`);
  return chain;
}

function normalizeAddress(value, chain, label) {
  const address = textValue(value, label, 128);
  const family = CHAINS.get(chain).family;
  if (family === "evm") {
    invariant(/^0x[a-fA-F0-9]{40}$/.test(address), `${label} must be a 20-byte EVM address`);
    return address.toLowerCase();
  }
  invariant(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address), `${label} must be a base58 Solana address`);
  invariant(base58ByteLength(address, label) === 32, `${label} must decode to 32 bytes`);
  return address;
}

function normalizeAssetId(value, chain, label = "assetId") {
  const assetId = textValue(value, label, 128);
  if (assetId.toLowerCase() === "native") return "native";
  return normalizeAddress(assetId, chain, label);
}

function normalizeTransactionHash(value, chain, label = "transactionHash") {
  const hash = textValue(value, label, 160);
  if (CHAINS.get(chain).family === "evm") {
    invariant(/^0x[a-fA-F0-9]{64}$/.test(hash), `${label} must be a 32-byte EVM hash`);
    return hash.toLowerCase();
  }
  invariant(/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(hash), `${label} must be a Solana signature`);
  invariant(base58ByteLength(hash, label) === 64, `${label} must decode to 64 bytes`);
  return hash;
}

function normalizeRequestId(value, label = "requestId") {
  const requestId = textValue(value, label, 240);
  invariant(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(requestId), `${label} contains unsupported characters`);
  return requestId;
}

function decimalToAtomic(value, decimals, label) {
  const amount = textValue(value, label, 120);
  invariant(/^(0|[1-9]\d*)(\.\d+)?$/.test(amount), `${label} must be an unsigned decimal string`);
  const [whole, fraction = ""] = amount.split(".");
  invariant(fraction.length <= decimals, `${label} exceeds ${decimals} decimal places`);
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}

function normalizeAtomic(value, label) {
  const amount = textValue(value, label, 120);
  invariant(/^(0|[1-9]\d*)$/.test(amount), `${label} must be an unsigned atomic-unit string`);
  return BigInt(amount);
}

function priceUnits(value, label) {
  invariant(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
  invariant(Math.abs(value) <= 1_000_000_000, `${label} is too large`);
  return BigInt(Math.round(value * 10_000));
}

function isoTime(value, label) {
  const input = textValue(value, label, 80);
  const fields = input.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/,
  );
  invariant(fields, `${label} must be an RFC 3339 timestamp with a timezone`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = fields;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  invariant(
    month >= 1 && month <= 12 && day >= 1 && day <= daysPerMonth[month - 1] &&
      Number(hourText) <= 23 && Number(minuteText) <= 59 && Number(secondText) <= 59 &&
      (offsetHourText === undefined || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59)),
    `${label} has an invalid calendar date or clock time`,
  );
  const parsed = new Date(input);
  invariant(!Number.isNaN(parsed.valueOf()), `${label} must be an ISO timestamp`);
  return parsed.toISOString();
}

function explorerUrl(chain, transactionHash) {
  const config = CHAINS.get(chain);
  return `${config.explorer}${transactionHash}${config.query ?? ""}`;
}

function covenantPayload(rawCovenant) {
  const { integrity: _integrity, ...payload } = rawCovenant;
  return payload;
}

export function buildFundingCovenant(rawPacket, rawTerms) {
  const packetVerification = verifyMarginPacket(rawPacket);
  invariant(packetVerification.valid, "packet integrity verification failed");
  const terms = object(rawTerms, "terms");
  const optionId = textValue(terms.optionId, "terms.optionId", 80);
  const option = rawPacket.clientOptions.find((candidate) => candidate.id === optionId);
  invariant(option, `terms.optionId ${optionId} is not present in the packet`);
  invariant(option.pricingState === "priced" && option.feeRange, "selected option is not fully priced");

  const price = object(terms.price, "terms.price");
  const priceAmount = textValue(price.amount, "terms.price.amount", 120);
  const priceCurrency = textValue(price.currency, "terms.price.currency", 12).toUpperCase();
  invariant(
    priceCurrency === rawPacket.marginSnapshot.currency,
    "terms.price.currency must match the packet currency",
  );
  const selectedPrice = decimalToAtomic(priceAmount, 4, "terms.price.amount");
  invariant(selectedPrice > 0n, "terms.price.amount must be positive");
  invariant(
    selectedPrice >= priceUnits(option.feeRange.min, "option.feeRange.min") &&
      selectedPrice <= priceUnits(option.feeRange.max, "option.feeRange.max"),
    "terms.price.amount must be inside the selected option fee range",
  );

  const settlement = object(terms.settlement, "terms.settlement");
  const chain = normalizeChain(settlement.chain, "terms.settlement.chain");
  const assetSymbol = textValue(settlement.assetSymbol, "terms.settlement.assetSymbol", 16).toUpperCase();
  invariant(/^[A-Z0-9._-]{2,16}$/.test(assetSymbol), "terms.settlement.assetSymbol is invalid");
  const decimals = integer(settlement.decimals, "terms.settlement.decimals", { min: 0, max: 18 });
  const settlementAmount = textValue(settlement.amount, "terms.settlement.amount", 120);
  const settlementAtomic = decimalToAtomic(
    settlementAmount,
    decimals,
    "terms.settlement.amount",
  );
  invariant(settlementAtomic > 0n, "terms.settlement.amount must be positive");
  const assetId = normalizeAssetId(settlement.assetId, chain, "terms.settlement.assetId");
  const destination = normalizeAddress(settlement.destination, chain, "terms.settlement.destination");

  let conversion = null;
  if (priceCurrency !== assetSymbol) {
    invariant(
      terms.conversion !== undefined,
      "cross-asset settlement requires owner_fixed conversion",
    );
    const rawConversion = object(terms.conversion, "terms.conversion");
    invariant(rawConversion.mode === "owner_fixed", "cross-asset settlement requires owner_fixed conversion");
    conversion = {
      mode: "owner_fixed",
      sourceRef: textValue(rawConversion.sourceRef, "terms.conversion.sourceRef", 160),
    };
  } else if (terms.conversion !== undefined) {
    const rawConversion = object(terms.conversion, "terms.conversion");
    invariant(rawConversion.mode === "same_asset", "same-asset conversion mode must be same_asset");
    conversion = { mode: "same_asset" };
  }

  const binding = object(terms.binding, "terms.binding");
  invariant(
    binding.mode === "public_transaction" || binding.mode === "provider_request",
    "terms.binding.mode must be public_transaction or provider_request",
  );
  const expectedRequestId = binding.mode === "provider_request"
    ? normalizeRequestId(binding.expectedRequestId, "terms.binding.expectedRequestId")
    : null;
  const ownerApprovalRef = textValue(terms.ownerApprovalRef, "terms.ownerApprovalRef", 200);
  const ownerApprovedAt = isoTime(terms.ownerApprovedAt, "terms.ownerApprovedAt");
  const policyInput = terms.policy === undefined ? {} : object(terms.policy, "terms.policy");
  const minimumConfirmations = integer(
    policyInput.minimumConfirmations ?? 1,
    "terms.policy.minimumConfirmations",
    { min: 1, max: 10_000 },
  );
  const validUntil = policyInput.validUntil === undefined
    ? null
    : isoTime(policyInput.validUntil, "terms.policy.validUntil");
  invariant(
    validUntil === null || validUntil > ownerApprovedAt,
    "terms.policy.validUntil must be after terms.ownerApprovedAt",
  );

  const covenant = {
    schemaVersion: 1,
    kind: "mermail-freelance-funding-covenant",
    packetDigest: rawPacket.integrity.packetDigest,
    selection: {
      optionId,
      price: { amount: priceAmount, currency: priceCurrency },
    },
    settlement: {
      chain,
      assetSymbol,
      assetId,
      decimals,
      amount: settlementAmount,
      amountAtomic: settlementAtomic.toString(),
      destination,
    },
    conversion,
    binding: {
      mode: binding.mode,
      expectedRequestId,
    },
    ownerApproval: {
      ref: ownerApprovalRef,
      approvedAt: ownerApprovedAt,
    },
    policy: {
      exactAmount: true,
      terminalProviderStatus: true,
      independentPublicChainReceipt: true,
      minimumConfirmations,
      validUntil,
      replayProtection: true,
    },
  };

  return {
    ...covenant,
    integrity: {
      algorithm: "sha256",
      canonicalization: "sorted-json-v1",
      covenantDigest: sha256(covenant),
    },
  };
}

export function verifyFundingCovenant(rawCovenant) {
  object(rawCovenant, "covenant");
  const integrity = object(rawCovenant.integrity, "covenant.integrity");
  invariant(integrity.algorithm === "sha256", "covenant.integrity.algorithm must be sha256");
  invariant(
    integrity.canonicalization === "sorted-json-v1",
    "covenant.integrity.canonicalization must be sorted-json-v1",
  );
  const actualDigest = textValue(integrity.covenantDigest, "covenant.integrity.covenantDigest", 64);
  invariant(/^[a-f0-9]{64}$/.test(actualDigest), "covenant.integrity.covenantDigest is invalid");
  const expectedDigest = sha256(covenantPayload(rawCovenant));
  return { valid: actualDigest === expectedDigest, expectedDigest, actualDigest };
}

function proofId(chain, transactionHash) {
  return sha256({ chain, transactionHash });
}

function rebuildCovenant(rawPacket, covenant) {
  return buildFundingCovenant(rawPacket, {
    optionId: covenant.selection.optionId,
    price: covenant.selection.price,
    settlement: {
      chain: covenant.settlement.chain,
      assetSymbol: covenant.settlement.assetSymbol,
      assetId: covenant.settlement.assetId,
      decimals: covenant.settlement.decimals,
      amount: covenant.settlement.amount,
      destination: covenant.settlement.destination,
    },
    conversion: covenant.conversion ?? undefined,
    binding: covenant.binding,
    ownerApprovalRef: covenant.ownerApproval.ref,
    ownerApprovedAt: covenant.ownerApproval.approvedAt,
    policy: {
      minimumConfirmations: covenant.policy.minimumConfirmations,
      validUntil: covenant.policy.validUntil ?? undefined,
    },
  });
}

function gateResult(status, reasons, common, publicReceipt = null) {
  return {
    status,
    fundingSatisfied: status === "FUNDED",
    reasons,
    ...common,
    publicReceipt,
    actionAuthority: {
      startWork: false,
      sendMessage: false,
      transferFunds: false,
      reason: "Funding evidence never replaces explicit owner approval for work, messaging, or money movement.",
    },
  };
}

function buildPublicReceipt(covenant, provider, chainObservation, derivedProofId) {
  const payload = {
    schemaVersion: 1,
    kind: "mermail-freelance-public-funding-receipt",
    status: "FUNDED",
    packetDigest: covenant.packetDigest,
    covenantDigest: covenant.integrity.covenantDigest,
    optionId: covenant.selection.optionId,
    priceCommitment: sha256(covenant.selection.price),
    ownerApprovalCommitment: sha256(covenant.ownerApproval),
    proofId: derivedProofId,
    settlement: {
      chain: covenant.settlement.chain,
      assetSymbol: covenant.settlement.assetSymbol,
      assetId: covenant.settlement.assetId,
      decimals: covenant.settlement.decimals,
      amount: covenant.settlement.amount,
      amountAtomic: covenant.settlement.amountAtomic,
      destination: covenant.settlement.destination,
      transactionHash: chainObservation.transactionHash,
      explorerUrl: explorerUrl(covenant.settlement.chain, chainObservation.transactionHash),
      settledAt: chainObservation.settledAt,
    },
    assurance: "live_rpc",
    privacy: {
      includesEmailContent: false,
      includesProjectName: false,
      includesProviderRequestId: false,
    },
  };
  if (provider) payload.providerRequestCommitment = sha256(provider.requestId);
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      canonicalization: "sorted-json-v1",
      receiptDigest: sha256(payload),
    },
  };
}

export function verifyPublicFundingReceipt(rawReceipt, options = {}) {
  object(rawReceipt, "receipt");
  const integrity = object(rawReceipt.integrity, "receipt.integrity");
  invariant(integrity.algorithm === "sha256", "receipt.integrity.algorithm must be sha256");
  invariant(
    integrity.canonicalization === "sorted-json-v1",
    "receipt.integrity.canonicalization must be sorted-json-v1",
  );
  const actualDigest = textValue(integrity.receiptDigest, "receipt.integrity.receiptDigest", 64);
  invariant(/^[a-f0-9]{64}$/.test(actualDigest), "receipt.integrity.receiptDigest is invalid");
  const { integrity: _integrity, ...payload } = rawReceipt;
  const expectedDigest = sha256(payload);
  let structureValid = true;
  try {
    invariant(rawReceipt.schemaVersion === 1, "receipt.schemaVersion must be 1");
    invariant(
      rawReceipt.kind === "mermail-freelance-public-funding-receipt",
      "receipt.kind is invalid",
    );
    invariant(rawReceipt.status === "FUNDED", "receipt.status must be FUNDED");
    invariant(rawReceipt.assurance === "live_rpc", "receipt.assurance must be live_rpc");
    for (const field of [
      "packetDigest",
      "covenantDigest",
      "priceCommitment",
      "ownerApprovalCommitment",
      "proofId",
    ]) {
      invariant(/^[a-f0-9]{64}$/.test(rawReceipt[field]), `receipt.${field} is invalid`);
    }
    if (rawReceipt.providerRequestCommitment !== undefined) {
      invariant(
        /^[a-f0-9]{64}$/.test(rawReceipt.providerRequestCommitment),
        "receipt.providerRequestCommitment is invalid",
      );
    }
    textValue(rawReceipt.optionId, "receipt.optionId", 80);
    const settlement = object(rawReceipt.settlement, "receipt.settlement");
    const chain = normalizeChain(settlement.chain, "receipt.settlement.chain");
    const hash = normalizeTransactionHash(
      settlement.transactionHash,
      chain,
      "receipt.settlement.transactionHash",
    );
    const assetSymbol = textValue(
      settlement.assetSymbol,
      "receipt.settlement.assetSymbol",
      16,
    );
    invariant(
      assetSymbol === assetSymbol.toUpperCase() && /^[A-Z0-9._-]{2,16}$/.test(assetSymbol),
      "receipt.settlement.assetSymbol is invalid",
    );
    normalizeAssetId(settlement.assetId, chain, "receipt.settlement.assetId");
    const decimals = integer(settlement.decimals, "receipt.settlement.decimals", { min: 0, max: 18 });
    const amountAtomic = normalizeAtomic(
      settlement.amountAtomic,
      "receipt.settlement.amountAtomic",
    );
    invariant(
      decimalToAtomic(settlement.amount, decimals, "receipt.settlement.amount") === amountAtomic,
      "receipt settlement amount and atomic amount differ",
    );
    normalizeAddress(settlement.destination, chain, "receipt.settlement.destination");
    isoTime(settlement.settledAt, "receipt.settlement.settledAt");
    invariant(rawReceipt.proofId === proofId(chain, hash), "receipt.proofId does not match its transaction");
    invariant(
      settlement.explorerUrl === explorerUrl(chain, hash),
      "receipt explorer URL does not match its transaction",
    );
    const privacy = object(rawReceipt.privacy, "receipt.privacy");
    invariant(
      privacy.includesEmailContent === false &&
        privacy.includesProjectName === false &&
        privacy.includesProviderRequestId === false,
      "receipt privacy declaration is invalid",
    );
  } catch {
    structureValid = false;
  }
  let bindingValid = false;
  if (options.covenant !== undefined && options.approvedCovenantDigest !== undefined) {
    try {
      const covenant = object(options.covenant, "options.covenant");
      const covenantVerification = verifyFundingCovenant(covenant);
      invariant(covenantVerification.valid, "receipt covenant integrity check failed");
      const approvedDigest = textValue(
        options.approvedCovenantDigest,
        "options.approvedCovenantDigest",
        64,
      );
      invariant(/^[a-f0-9]{64}$/.test(approvedDigest), "approved covenant digest is invalid");
      invariant(approvedDigest === covenant.integrity.covenantDigest, "approved covenant digest mismatch");
      invariant(rawReceipt.packetDigest === covenant.packetDigest, "receipt packet binding mismatch");
      invariant(
        rawReceipt.covenantDigest === covenant.integrity.covenantDigest,
        "receipt covenant binding mismatch",
      );
      invariant(rawReceipt.optionId === covenant.selection.optionId, "receipt option binding mismatch");
      invariant(
        rawReceipt.priceCommitment === sha256(covenant.selection.price),
        "receipt price binding mismatch",
      );
      invariant(
        rawReceipt.ownerApprovalCommitment === sha256(covenant.ownerApproval),
        "receipt owner-approval binding mismatch",
      );
      const settlement = rawReceipt.settlement;
      invariant(settlement.chain === covenant.settlement.chain, "receipt chain binding mismatch");
      invariant(settlement.assetSymbol === covenant.settlement.assetSymbol, "receipt asset-symbol binding mismatch");
      invariant(settlement.assetId === covenant.settlement.assetId, "receipt asset binding mismatch");
      invariant(settlement.decimals === covenant.settlement.decimals, "receipt decimals binding mismatch");
      invariant(settlement.amount === covenant.settlement.amount, "receipt amount binding mismatch");
      invariant(
        settlement.amountAtomic === covenant.settlement.amountAtomic,
        "receipt atomic-amount binding mismatch",
      );
      invariant(
        settlement.destination === covenant.settlement.destination,
        "receipt destination binding mismatch",
      );
      const normalizedSettlementTime = isoTime(settlement.settledAt, "receipt.settlement.settledAt");
      invariant(
        normalizedSettlementTime >= covenant.ownerApproval.approvedAt,
        "receipt settlement predates covenant approval",
      );
      invariant(
        covenant.policy.validUntil === null || normalizedSettlementTime <= covenant.policy.validUntil,
        "receipt settlement is after covenant expiry",
      );
      if (covenant.binding.mode === "provider_request") {
        invariant(
          rawReceipt.providerRequestCommitment === sha256(covenant.binding.expectedRequestId),
          "receipt provider-request binding mismatch",
        );
      } else {
        invariant(
          rawReceipt.providerRequestCommitment === undefined,
          "receipt has an unexpected provider-request commitment",
        );
      }
      bindingValid = true;
    } catch {
      bindingValid = false;
    }
  }
  const selfConsistent = structureValid && bindingValid && actualDigest === expectedDigest;
  return {
    valid: false,
    selfConsistent,
    structureValid,
    bindingValid,
    liveVerified: false,
    requiresLiveVerification: true,
    expectedDigest,
    actualDigest,
  };
}

export async function verifyPublicFundingReceiptLive(
  rawReceipt,
  rawCovenant,
  options = {},
) {
  const inspection = verifyPublicFundingReceipt(rawReceipt, {
    covenant: rawCovenant,
    approvedCovenantDigest: options.approvedCovenantDigest,
  });
  if (!inspection.selfConsistent) {
    return {
      ...inspection,
      reasons: ["receipt is not structurally consistent with the approved covenant"],
    };
  }

  let observation;
  try {
    observation = await observePublicSettlement(
      rawCovenant,
      rawReceipt.settlement.transactionHash,
      { rpcUrl: options.rpcUrl, fetchFn: options.fetchFn },
    );
  } catch (error) {
    return {
      ...inspection,
      reasons: [`live public-chain verification failed: ${error.message}`],
    };
  }

  const reasons = [];
  const expected = rawReceipt.settlement;
  for (const field of [
    "chain",
    "assetSymbol",
    "assetId",
    "decimals",
    "amountAtomic",
    "destination",
    "transactionHash",
    "settledAt",
  ]) {
    if (observation[field] !== expected[field]) reasons.push(`live ${field} mismatch`);
  }
  if (observation.receiptStatus !== "success") reasons.push("live receipt is not successful");
  if (CHAINS.get(expected.chain).family === "evm") {
    if (observation.confirmations < rawCovenant.policy.minimumConfirmations) {
      reasons.push("live receipt has inadequate confirmations");
    }
  } else if (observation.finality !== "finalized") {
    reasons.push("live receipt is not finalized");
  }

  if (rawCovenant.binding.mode === "provider_request") {
    try {
      const provider = object(options.provider, "options.provider");
      invariant(
        provider.source === "paybox_get_request",
        "provider source must be paybox_get_request",
      );
      const requestId = normalizeRequestId(provider.requestId, "options.provider.requestId");
      const status = textValue(provider.status, "options.provider.status", 80).toLowerCase();
      invariant(provider.terminal === true, "provider request is not terminal");
      invariant(SUCCESS_STATUSES.has(status), "provider request is not successful");
      invariant(
        requestId === rawCovenant.binding.expectedRequestId,
        "provider request id mismatch",
      );
      invariant(
        normalizeTransactionHash(
          provider.transactionHash,
          expected.chain,
          "options.provider.transactionHash",
        ) === expected.transactionHash,
        "provider transaction hash mismatch",
      );
      invariant(
        rawReceipt.providerRequestCommitment === sha256(requestId),
        "provider request commitment mismatch",
      );
    } catch (error) {
      reasons.push(`live provider verification failed: ${error.message}`);
    }
  }

  return {
    ...inspection,
    valid: reasons.length === 0,
    liveVerified: reasons.length === 0,
    requiresLiveVerification: false,
    reasons,
  };
}

export function verifyFundingGate(rawPacket, rawCovenant, rawEvidence, options = {}) {
  const packetVerification = verifyMarginPacket(rawPacket);
  const covenantVerification = verifyFundingCovenant(rawCovenant);
  const common = {
    packetValid: packetVerification.valid,
    covenantValid: covenantVerification.valid,
    packetDigest: rawPacket?.integrity?.packetDigest ?? null,
    covenantDigest: rawCovenant?.integrity?.covenantDigest ?? null,
  };
  if (!packetVerification.valid || !covenantVerification.valid) {
    return gateResult("MISMATCH", ["packet or covenant integrity check failed"], common);
  }
  if (rawCovenant.packetDigest !== rawPacket.integrity.packetDigest) {
    return gateResult("MISMATCH", ["covenant is bound to a different margin packet"], common);
  }
  try {
    const rebuilt = rebuildCovenant(rawPacket, rawCovenant);
    if (canonicalJson(rebuilt) !== canonicalJson(rawCovenant)) {
      return gateResult("MISMATCH", ["covenant schema or policy differs from the validated form"], common);
    }
  } catch (error) {
    return gateResult("MISMATCH", [`covenant semantic validation failed: ${error.message}`], common);
  }

  if (options.approvedCovenantDigest === undefined) {
    return gateResult(
      "APPROVAL_REQUIRED",
      ["the exact covenant digest has not been supplied from the owner's approval"],
      common,
    );
  }
  const approvedCovenantDigest = textValue(
    options.approvedCovenantDigest,
    "options.approvedCovenantDigest",
    64,
  );
  invariant(
    /^[a-f0-9]{64}$/.test(approvedCovenantDigest),
    "options.approvedCovenantDigest must be a SHA-256 digest",
  );
  if (approvedCovenantDigest !== rawCovenant.integrity.covenantDigest) {
    return gateResult(
      "MISMATCH",
      ["covenant digest differs from the exact owner-approved digest"],
      common,
    );
  }

  const evidence = object(rawEvidence, "evidence");
  const chainObservation = object(evidence.chain, "evidence.chain");
  invariant(
    chainObservation.source === "public_chain_rpc",
    "evidence.chain.source must be public_chain_rpc",
  );

  const expected = rawCovenant.settlement;
  const expectedChain = normalizeChain(expected.chain, "covenant.settlement.chain");
  const observedChain = normalizeChain(chainObservation.chain, "evidence.chain.chain");
  if (observedChain !== expectedChain) {
    return gateResult("MISMATCH", ["chain mismatch"], common);
  }
  const observedTransactionHash = normalizeTransactionHash(
    chainObservation.transactionHash,
    observedChain,
    "evidence.chain.transactionHash",
  );
  let provider = null;
  let observedRequestId = null;
  let observedStatus = null;
  if (rawCovenant.binding.mode === "provider_request") {
    provider = object(evidence.provider, "evidence.provider");
    invariant(
      provider.source === "paybox_get_request",
      "evidence.provider.source must be paybox_get_request, not an invocation log or message claim",
    );
    observedRequestId = normalizeRequestId(provider.requestId, "evidence.provider.requestId");
    observedStatus = textValue(provider.status, "evidence.provider.status", 80).toLowerCase();
    invariant(typeof provider.terminal === "boolean", "evidence.provider.terminal must be boolean");
  }

  const mismatches = [];
  if (provider) {
    const providerTransactionHash = normalizeTransactionHash(
      provider.transactionHash,
      expectedChain,
      "evidence.provider.transactionHash",
    );
    if (observedRequestId !== rawCovenant.binding.expectedRequestId) mismatches.push("provider request id mismatch");
    if (providerTransactionHash !== observedTransactionHash) mismatches.push("provider and chain transaction hashes differ");
  }

  const observedAssetId = normalizeAssetId(
    chainObservation.assetId,
    observedChain,
    "evidence.chain.assetId",
  );
  const observedAssetSymbol = textValue(
    chainObservation.assetSymbol,
    "evidence.chain.assetSymbol",
    16,
  ).toUpperCase();
  const observedDecimals = integer(chainObservation.decimals, "evidence.chain.decimals", {
    min: 0,
    max: 18,
  });
  const observedDestination = normalizeAddress(
    chainObservation.destination,
    observedChain,
    "evidence.chain.destination",
  );
  const observedAmount = normalizeAtomic(chainObservation.amountAtomic, "evidence.chain.amountAtomic");
  const expectedAmount = normalizeAtomic(expected.amountAtomic, "covenant.settlement.amountAtomic");
  if (observedAssetId !== expected.assetId) mismatches.push("asset identity mismatch");
  if (observedAssetSymbol !== expected.assetSymbol) mismatches.push("asset symbol mismatch");
  if (observedDecimals !== expected.decimals) mismatches.push("asset decimal mismatch");
  if (observedDestination !== expected.destination) mismatches.push("destination mismatch");
  const settledAt = isoTime(chainObservation.settledAt, "evidence.chain.settledAt");
  if (settledAt < rawCovenant.ownerApproval.approvedAt) {
    mismatches.push("settlement predates owner approval of the covenant");
  }
  if (rawCovenant.policy.validUntil && settledAt > rawCovenant.policy.validUntil) {
    mismatches.push("settlement occurred after the covenant expiry");
  }
  let chainPending = chainObservation.receiptStatus === "pending";
  let chainFailed = !["pending", "success"].includes(chainObservation.receiptStatus);
  if (CHAINS.get(observedChain).family === "evm") {
    const confirmations = integer(chainObservation.confirmations, "evidence.chain.confirmations", {
      min: 0,
      max: 10_000_000,
    });
    if (confirmations < rawCovenant.policy.minimumConfirmations) {
      chainPending = true;
    }
  } else if (chainObservation.finality !== "finalized") {
    chainPending = true;
  }

  if (mismatches.length > 0) return gateResult("MISMATCH", mismatches, common);

  const derivedProofId = proofId(observedChain, observedTransactionHash);
  if (options.usedProofIds === undefined) {
    return gateResult(
      "REPLAY_STATE_REQUIRED",
      ["the consumed-proof ledger is required, even when it is an empty array"],
      { ...common, proofId: derivedProofId },
    );
  }
  const usedProofIds = array(options.usedProofIds, "options.usedProofIds").map((value, index) => {
    const id = textValue(value, `options.usedProofIds[${index}]`, 64);
    invariant(/^[a-f0-9]{64}$/.test(id), `options.usedProofIds[${index}] must be a proof digest`);
    return id;
  });
  if (usedProofIds.includes(derivedProofId)) {
    return gateResult("REPLAY_BLOCKED", ["transaction proof was already consumed"], {
      ...common,
      proofId: derivedProofId,
    });
  }

  if (chainPending) {
    return gateResult("PENDING", ["public-chain receipt has not reached the required finality"], {
      ...common,
      proofId: derivedProofId,
    });
  }
  if (chainFailed) {
    return gateResult("UNVERIFIED", ["public-chain transaction did not settle successfully"], {
      ...common,
      proofId: derivedProofId,
    });
  }
  if (provider && (!provider.terminal || PENDING_STATUSES.has(observedStatus))) {
    return gateResult("PENDING", ["PayBox provider request is not terminal"], {
      ...common,
      proofId: derivedProofId,
    });
  }
  if (provider && !SUCCESS_STATUSES.has(observedStatus)) {
    return gateResult("UNVERIFIED", ["PayBox provider request did not finish successfully"], {
      ...common,
      proofId: derivedProofId,
    });
  }
  if (observedAmount < expectedAmount) {
    return gateResult("PARTIALLY_FUNDED", ["settled amount is below the owner-approved covenant amount"], {
      ...common,
      proofId: derivedProofId,
    });
  }
  if (observedAmount > expectedAmount) {
    return gateResult("OVERFUNDED_REVIEW", ["settled amount exceeds the exact owner-approved covenant amount"], {
      ...common,
      proofId: derivedProofId,
    });
  }

  if (!LIVE_RPC_OBSERVATIONS.has(chainObservation)) {
    return gateResult(
      "RECORDED_MATCH",
      ["recorded observation matches, but only a fresh live RPC read can issue FUNDED"],
      { ...common, proofId: derivedProofId },
    );
  }

  const publicReceipt = buildPublicReceipt(
    rawCovenant,
    provider ? { ...provider, requestId: observedRequestId } : null,
    { ...chainObservation, transactionHash: observedTransactionHash, settledAt },
    derivedProofId,
  );
  return gateResult("FUNDED", [provider
    ? "terminal provider status and independent public-chain receipt match the covenant"
    : "independent public-chain receipt matches the owner-approved covenant"], {
    ...common,
    proofId: derivedProofId,
  }, publicReceipt);
}

function ipv4Octets(literal) {
  const match = literal.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null;
}

function disallowedIpv4(octets) {
  const [a, b, c] = octets;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function ipv6Groups(literal) {
  let normalized = literal;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const octets = ipv4Octets(normalized.slice(separator + 1));
    if (separator < 0 || !octets) return null;
    normalized = `${normalized.slice(0, separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function disallowedIpv6(groups) {
  const allZero = groups.every((group) => group === 0);
  const loopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const first = groups[0];
  const uniqueLocal = (first & 0xfe00) === 0xfc00;
  const linkOrSiteLocal = (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0;
  const multicast = (first & 0xff00) === 0xff00;
  const documentation = first === 0x2001 && groups[1] === 0x0db8;
  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const mappedPrivate = ipv4Mapped && disallowedIpv4([
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ]);
  return allZero || loopback || uniqueLocal || linkOrSiteLocal || multicast || documentation || mappedPrivate;
}

function validateRpcUrl(rpcUrl) {
  const url = new URL(rpcUrl);
  invariant(url.protocol === "https:", "rpcUrl must use HTTPS");
  invariant(!url.username && !url.password, "rpcUrl must not contain embedded credentials");
  invariant(!url.hash, "rpcUrl must not contain a fragment");
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  const ipLiteral = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  invariant(
    hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !hostname.endsWith(".home") &&
      !hostname.endsWith(".lan"),
    "rpcUrl must not target a local hostname",
  );
  const ipVersion = isIP(ipLiteral);
  if (ipVersion === 4) {
    invariant(
      !disallowedIpv4(ipv4Octets(ipLiteral)),
      "rpcUrl must not target a private, reserved, or link-local address",
    );
  } else if (ipVersion === 6) {
    const groups = ipv6Groups(ipLiteral);
    invariant(
      groups && !disallowedIpv6(groups),
      "rpcUrl must not target a private, reserved, or link-local address",
    );
  }
  return url.toString();
}

async function rpcCall(rpcUrl, method, params, fetchFn) {
  const url = new URL(rpcUrl);
  const response = await fetchFn(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  invariant(response.ok, `RPC ${method} returned HTTP ${response.status}`);
  const payload = await response.json();
  invariant(!payload.error, `RPC ${method} failed`);
  invariant(payload.result !== undefined && payload.result !== null, `RPC ${method} returned no result`);
  return payload.result;
}

function hexQuantity(value, label) {
  invariant(typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value), `${label} is not a hex quantity`);
  return BigInt(value);
}

function accountKeyValue(entry) {
  return typeof entry === "string" ? entry : entry?.pubkey;
}

function rpcAtomicValue(value, label) {
  if (typeof value === "string") {
    invariant(/^(0|[1-9]\d*)$/.test(value), `${label} must be an unsigned integer string`);
    return BigInt(value);
  }
  invariant(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    `${label} must be a safe unsigned integer`,
  );
  return BigInt(value);
}

function attestLiveObservation(observation) {
  Object.freeze(observation);
  LIVE_RPC_OBSERVATIONS.add(observation);
  return observation;
}

function collectSolanaInstructions(transaction) {
  const direct = transaction.transaction?.message?.instructions ?? [];
  const inner = (transaction.meta?.innerInstructions ?? []).flatMap((entry) => entry.instructions ?? []);
  return [...direct, ...inner];
}

export async function observePublicSettlement(rawCovenant, transactionHash, options = {}) {
  const covenantVerification = verifyFundingCovenant(rawCovenant);
  invariant(covenantVerification.valid, "covenant integrity verification failed");
  const chain = normalizeChain(rawCovenant.settlement.chain, "covenant.settlement.chain");
  const hash = normalizeTransactionHash(transactionHash, chain);
  const rpcUrl = validateRpcUrl(textValue(options.rpcUrl, "rpcUrl", 500));
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  invariant(typeof fetchFn === "function", "fetch is unavailable");
  const expected = rawCovenant.settlement;

  if (CHAINS.get(chain).family === "evm") {
    const [rawChainId, transaction, receipt, latestBlock] = await Promise.all([
      rpcCall(rpcUrl, "eth_chainId", [], fetchFn),
      rpcCall(rpcUrl, "eth_getTransactionByHash", [hash], fetchFn),
      rpcCall(rpcUrl, "eth_getTransactionReceipt", [hash], fetchFn),
      rpcCall(rpcUrl, "eth_blockNumber", [], fetchFn),
    ]);
    invariant(hexQuantity(rawChainId, "RPC chain id") === CHAINS.get(chain).chainId, "RPC chain does not match covenant");
    invariant(transaction.hash?.toLowerCase() === hash, "RPC transaction hash mismatch");
    invariant(receipt.transactionHash?.toLowerCase() === hash, "RPC receipt hash mismatch");
    invariant(transaction.blockNumber === receipt.blockNumber, "RPC transaction and receipt block mismatch");
    const blockNumber = hexQuantity(receipt.blockNumber, "receipt.blockNumber");
    const latest = hexQuantity(latestBlock, "latest block");
    invariant(latest >= blockNumber, "latest block predates the receipt");
    const block = await rpcCall(rpcUrl, "eth_getBlockByNumber", [receipt.blockNumber, false], fetchFn);
    const settledAt = new Date(Number(hexQuantity(block.timestamp, "block.timestamp")) * 1000).toISOString();

    let destination;
    let amountAtomic;
    let observedDecimals;
    if (expected.assetId === "native") {
      destination = normalizeAddress(transaction.to, chain, "transaction.to");
      amountAtomic = hexQuantity(transaction.value, "transaction.value").toString();
      observedDecimals = 18;
      invariant(transaction.input === "0x" || transaction.input === "0x0", "native settlement must not include contract calldata");
    } else {
      invariant(
        normalizeAddress(transaction.to, chain, "transaction.to") === expected.assetId,
        "transaction does not call the covenant token contract",
      );
      invariant(
        hexQuantity(transaction.value, "transaction.value") === 0n,
        "ERC-20 settlement must not transfer native value",
      );
      invariant(
        normalizeAddress(receipt.to, chain, "receipt.to") === expected.assetId,
        "receipt does not target the covenant token contract",
      );
      const sender = normalizeAddress(transaction.from, chain, "transaction.from");
      const input = textValue(transaction.input, "transaction.input", 4096).toLowerCase();
      invariant(/^0xa9059cbb[0-9a-f]{128}$/.test(input), "token settlement must be one exact ERC-20 transfer call");
      destination = normalizeAddress(`0x${input.slice(34, 74)}`, chain, "ERC-20 destination");
      amountAtomic = BigInt(`0x${input.slice(74, 138)}`).toString();
      const tokenTransfers = array(receipt.logs, "receipt.logs").filter((log) =>
        isObject(log) && typeof log.address === "string" &&
        log.address.toLowerCase() === expected.assetId &&
        Array.isArray(log.topics) &&
        String(log.topics[0]).toLowerCase() === ERC20_TRANSFER_TOPIC,
      );
      invariant(tokenTransfers.length === 1, "receipt must contain exactly one token Transfer event");
      const matchingTransfers = tokenTransfers.filter((log) => {
        if (!isObject(log) || typeof log.address !== "string" || !Array.isArray(log.topics)) return false;
        const topics = log.topics.map((topic) => String(topic).toLowerCase());
        if (topics.length !== 3 || topics[0] !== ERC20_TRANSFER_TOPIC) return false;
        if (!/^0x[0-9a-f]{64}$/.test(topics[1]) || !/^0x[0-9a-f]{64}$/.test(topics[2])) return false;
        return log.removed !== true &&
          log.address.toLowerCase() === expected.assetId &&
          `0x${topics[1].slice(-40)}` === sender &&
          `0x${topics[2].slice(-40)}` === destination;
      });
      invariant(
        matchingTransfers.length === 1,
        "receipt must contain one exact sender-bound ERC-20 Transfer event",
      );
      const eventData = String(matchingTransfers[0].data ?? "").toLowerCase();
      invariant(/^0x[0-9a-f]{64}$/.test(eventData), "ERC-20 Transfer amount is invalid");
      invariant(
        BigInt(eventData).toString() === amountAtomic,
        "ERC-20 calldata and Transfer event amounts differ",
      );
      const rawDecimals = await rpcCall(
        rpcUrl,
        "eth_call",
        [{ to: expected.assetId, data: "0x313ce567" }, receipt.blockNumber],
        fetchFn,
      );
      const decimalValue = hexQuantity(rawDecimals, "ERC-20 decimals");
      invariant(decimalValue <= 18n, "ERC-20 decimals is outside the supported range");
      observedDecimals = Number(decimalValue);
    }
    return attestLiveObservation({
      source: "public_chain_rpc",
      chain,
      assetSymbol: expected.assetSymbol,
      assetId: expected.assetId,
      decimals: observedDecimals,
      amountAtomic,
      destination,
      transactionHash: hash,
      receiptStatus: receipt.status === "0x1" ? "success" : "failed",
      confirmations: Number(latest - blockNumber + 1n),
      settledAt,
    });
  }

  const transaction = await rpcCall(
    rpcUrl,
    "getTransaction",
    [hash, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
    fetchFn,
  );
  invariant(typeof transaction.blockTime === "number", "Solana transaction has no block time");
  const instructions = collectSolanaInstructions(transaction);
  invariant(
    transaction.transaction?.signatures?.[0] === hash,
    "Solana transaction signature mismatch",
  );
  let amountAtomic = 0n;
  let destination = expected.destination;
  let observedDecimals = expected.assetId === "native" ? 9 : null;
  if (expected.assetId === "native") {
    for (const instruction of instructions) {
      if (instruction.program !== "system" || instruction.parsed?.type !== "transfer") continue;
      const info = instruction.parsed.info;
      if (info.destination !== expected.destination) continue;
      amountAtomic += rpcAtomicValue(info.lamports, "system transfer lamports");
    }
    const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
    const recipientIndex = accountKeys.findIndex((entry) => accountKeyValue(entry) === expected.destination);
    invariant(recipientIndex >= 0, "SOL recipient is absent from transaction accounts");
    const before = array(transaction.meta?.preBalances, "Solana preBalances");
    const after = array(transaction.meta?.postBalances, "Solana postBalances");
    invariant(
      recipientIndex < before.length && recipientIndex < after.length,
      "SOL recipient balances are unavailable",
    );
    const initial = rpcAtomicValue(before[recipientIndex], "SOL previous balance");
    const final = rpcAtomicValue(after[recipientIndex], "SOL current balance");
    invariant(final >= initial && final - initial === amountAtomic, "SOL transfer amount differs from recipient net balance increase");
  } else {
    const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
    const before = array(transaction.meta?.preTokenBalances, "Solana preTokenBalances");
    const after = array(transaction.meta?.postTokenBalances, "Solana postTokenBalances");
    const recipientAccounts = new Set();
    for (const instruction of instructions) {
      if (!["spl-token", "spl-token-2022"].includes(instruction.program)) continue;
      if (!["transfer", "transferChecked"].includes(instruction.parsed?.type)) continue;
      const info = instruction.parsed.info;
      const destinationIndex = accountKeys.findIndex((entry) => accountKeyValue(entry) === info.destination);
      if (destinationIndex < 0) continue;
      const balance = after.find((entry) => entry.accountIndex === destinationIndex);
      if (!balance || balance.owner !== expected.destination || balance.mint !== expected.assetId) continue;
      invariant(
        instruction.parsed.type !== "transferChecked" || info.mint === expected.assetId,
        "SPL transferChecked mint does not match the covenant",
      );
      const rawAmount = info.tokenAmount?.amount ?? info.amount;
      const decimals = balance.uiTokenAmount?.decimals ?? info.tokenAmount?.decimals;
      invariant(Number.isInteger(decimals), "SPL token decimals are unavailable");
      invariant(observedDecimals === null || observedDecimals === decimals, "SPL token decimals conflict");
      observedDecimals = decimals;
      amountAtomic += rpcAtomicValue(rawAmount, "SPL token transfer amount");
      recipientAccounts.add(destinationIndex);
    }
    let netIncrease = 0n;
    for (const accountIndex of recipientAccounts) {
      const prior = before.find((entry) => entry.accountIndex === accountIndex);
      const current = after.find((entry) => entry.accountIndex === accountIndex);
      invariant(
        !prior || (prior.owner === expected.destination && prior.mint === expected.assetId),
        "SPL recipient ownership or mint changed during the transaction",
      );
      const priorAmount = prior ? normalizeAtomic(prior.uiTokenAmount?.amount, "SPL previous balance") : 0n;
      const currentAmount = normalizeAtomic(current.uiTokenAmount?.amount, "SPL current balance");
      invariant(currentAmount >= priorAmount, "SPL recipient balance decreased");
      netIncrease += currentAmount - priorAmount;
    }
    invariant(netIncrease === amountAtomic, "SPL transfer amount differs from recipient net balance increase");
  }
  invariant(observedDecimals !== null, "SPL token settlement was not found");
  return attestLiveObservation({
    source: "public_chain_rpc",
    chain,
    assetSymbol: expected.assetSymbol,
    assetId: expected.assetId,
    decimals: observedDecimals,
    amountAtomic: amountAtomic.toString(),
    destination,
    transactionHash: hash,
    receiptStatus: transaction.meta?.err === null ? "success" : "failed",
    finality: "finalized",
    settledAt: new Date(transaction.blockTime * 1000).toISOString(),
  });
}

function parseArgs(argv) {
  if (argv[0] === "--help" || argv[0] === "-h") return { command: null, help: true };
  const result = { command: argv[0] ?? null };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg.startsWith("--")) result[arg.slice(2).replaceAll("-", "_")] = argv[++index];
    else throw new Error(`unknown argument ${arg}`);
  }
  return result;
}

async function readJson(file, label) {
  invariant(file, `${label} is required`);
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    process.stdout.write(
      "Usage:\n" +
      "  funding-gate.mjs covenant --packet <json> --terms <json>\n" +
      "  funding-gate.mjs verify --packet <json> --covenant <json> --approved-covenant-digest <sha256> --used-proofs <json> (--chain-observation <json> | --tx <hash> --rpc-url <https-url>) [--provider <json>]\n" +
      "  funding-gate.mjs receipt-verify --receipt <json> --covenant <json> --approved-covenant-digest <sha256> --rpc-url <https-url> [--provider <json>]\n",
    );
    return;
  }
  if (args.command === "covenant") {
    const result = buildFundingCovenant(
      await readJson(args.packet, "--packet"),
      await readJson(args.terms, "--terms"),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (args.command === "receipt-verify") {
    invariant(args.approved_covenant_digest, "--approved-covenant-digest is required");
    invariant(args.rpc_url, "--rpc-url is required for receipt authentication");
    const covenant = await readJson(args.covenant, "--covenant");
    const provider = covenant.binding?.mode === "provider_request"
      ? await readJson(args.provider, "--provider")
      : undefined;
    const result = await verifyPublicFundingReceiptLive(
      await readJson(args.receipt, "--receipt"),
      covenant,
      {
        approvedCovenantDigest: args.approved_covenant_digest,
        rpcUrl: args.rpc_url,
        provider,
      },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
    return;
  }
  invariant(args.command === "verify", `unknown command ${args.command}`);
  const packet = await readJson(args.packet, "--packet");
  const covenant = await readJson(args.covenant, "--covenant");
  invariant(args.approved_covenant_digest, "--approved-covenant-digest is required");
  invariant(args.used_proofs, "--used-proofs is required, even for an empty ledger");
  const provider = covenant.binding?.mode === "provider_request"
    ? await readJson(args.provider, "--provider")
    : undefined;
  invariant(
    Boolean(args.chain_observation) !== Boolean(args.tx || args.rpc_url),
    "use either --chain-observation or both --tx and --rpc-url",
  );
  let chain;
  if (args.chain_observation) chain = await readJson(args.chain_observation, "--chain-observation");
  else {
    invariant(args.tx && args.rpc_url, "--tx and --rpc-url are both required");
    chain = await observePublicSettlement(covenant, args.tx, { rpcUrl: args.rpc_url });
  }
  const usedProofIds = await readJson(args.used_proofs, "--used-proofs");
  const evidence = provider ? { provider, chain } : { chain };
  const result = verifyFundingGate(packet, covenant, evidence, {
    approvedCovenantDigest: args.approved_covenant_digest,
    usedProofIds,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "FUNDED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Freelance Funding Gate: ${error.message}\n`);
    process.exitCode = 1;
  });
}
