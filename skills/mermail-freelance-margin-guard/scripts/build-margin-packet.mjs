#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ITEM_KINDS = new Set([
  "deliverable",
  "revision",
  "deadline",
  "support",
  "acceptance",
  "dependency",
  "other",
]);
const RELATIONS = new Set([
  "included",
  "clarifies",
  "exceeds_limit",
  "excluded",
  "absent",
  "ambiguous",
  "conflicting",
]);
const MATERIALITY = new Set(["low", "material"]);
const DEPENDENCY_OWNERS = new Set(["client", "freelancer", "shared", "unknown"]);

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

function textValue(value, label, max = 1000) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string`);
  const result = value.trim();
  invariant(result.length <= max, `${label} exceeds ${max} characters`);
  return result;
}

function idValue(value, label) {
  const result = textValue(value, label, 160);
  invariant(
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(result),
    `${label} must use only letters, numbers, dot, underscore, colon, at, slash, or hyphen`,
  );
  return result;
}

function requestItemIdValue(value, label) {
  const result = idValue(value, label);
  invariant(
    !/:(included|overflow)$/.test(result),
    `${label} cannot use the reserved :included or :overflow suffix`,
  );
  return result;
}

function finiteNumber(value, label, { min = 0, max = 1_000_000, integer = false } = {}) {
  invariant(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
  invariant(value >= min, `${label} must be at least ${min}`);
  invariant(value <= max, `${label} must be at most ${max}`);
  if (integer) invariant(Number.isInteger(value), `${label} must be an integer`);
  return value;
}

function dateValue(value, label) {
  const date = textValue(value, label);
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date), `${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${date}T00:00:00Z`);
  invariant(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(date), `${label} is invalid`);
  return date;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function range(min, max) {
  return { min: round(min), max: round(max) };
}

function addRanges(left, right) {
  return range(left.min + right.min, left.max + right.max);
}

function multiplyRange(input, multiplier) {
  return range(input.min * multiplier, input.max * multiplier);
}

function scaleRange(input, share) {
  return range(input.min * share, input.max * share);
}

function daysBetween(earlier, later) {
  const start = new Date(`${earlier}T00:00:00Z`).valueOf();
  const end = new Date(`${later}T00:00:00Z`).valueOf();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function addCalendarDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function normalizeEvidence(value) {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
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

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function evidencePayloadFromPacket(packet) {
  object(packet, "packet");
  const sources = array(packet.sources, "packet.sources");
  const baseline = object(packet.baseline, "packet.baseline");
  const request = object(packet.request, "packet.request");
  const requestLedger = array(packet.requestLedger, "packet.requestLedger");
  const delayAttribution = object(packet.delayAttribution, "packet.delayAttribution");
  const dependencies = array(delayAttribution.events, "packet.delayAttribution.events");

  return {
    sources,
    authoritySourceRefs: array(
      baseline.authoritySourceRefs,
      "packet.baseline.authoritySourceRefs",
    ),
    requestSourceRef: textValue(request.sourceRef, "packet.request.sourceRef", 160),
    requestLedger: requestLedger.map((row, index) => {
      object(row, `packet.requestLedger[${index}]`);
      return {
        id: textValue(row.id, `packet.requestLedger[${index}].id`, 180),
        status: textValue(row.status, `packet.requestLedger[${index}].status`, 40),
        evidence: object(row.evidence, `packet.requestLedger[${index}].evidence`),
      };
    }),
    dependencies,
  };
}

export function verifyMarginPacket(rawPacket) {
  object(rawPacket, "packet");
  const integrity = object(rawPacket.integrity, "packet.integrity");
  invariant(integrity.algorithm === "sha256", "packet.integrity.algorithm must be sha256");
  invariant(
    integrity.canonicalization === "sorted-json-v1",
    "packet.integrity.canonicalization must be sorted-json-v1",
  );
  const actualEvidenceDigest = textValue(
    integrity.evidenceDigest,
    "packet.integrity.evidenceDigest",
    64,
  );
  const actualPacketDigest = textValue(
    integrity.packetDigest,
    "packet.integrity.packetDigest",
    64,
  );
  invariant(/^[a-f0-9]{64}$/.test(actualEvidenceDigest), "packet.integrity.evidenceDigest is invalid");
  invariant(/^[a-f0-9]{64}$/.test(actualPacketDigest), "packet.integrity.packetDigest is invalid");

  const { integrity: _integrity, ...packet } = rawPacket;
  const expectedEvidenceDigest = sha256(evidencePayloadFromPacket(packet));
  const expectedPacketDigest = sha256(packet);
  const evidenceValid = actualEvidenceDigest === expectedEvidenceDigest;
  const packetValid = actualPacketDigest === expectedPacketDigest;

  return {
    valid: evidenceValid && packetValid,
    evidence: {
      valid: evidenceValid,
      expectedDigest: expectedEvidenceDigest,
      actualDigest: actualEvidenceDigest,
    },
    packet: {
      valid: packetValid,
      expectedDigest: expectedPacketDigest,
      actualDigest: actualPacketDigest,
    },
  };
}

function validateSource(source, index) {
  object(source, `sources[${index}]`);
  const id = idValue(source.id, `sources[${index}].id`);
  invariant(source.type === "email" || source.type === "user", `sources[${index}].type must be email or user`);
  const normalized = { id, type: source.type };

  if (source.type === "email") {
    normalized.messageId = textValue(source.messageId, `sources[${index}].messageId`, 240);
    normalized.date = dateValue(source.date, `sources[${index}].date`);
  } else {
    normalized.label = textValue(source.label, `sources[${index}].label`, 240);
  }

  if (source.quote !== undefined) normalized.quote = textValue(source.quote, `sources[${index}].quote`, 1000);
  return normalized;
}

function validateSourceRef(ref, label, sourceMap) {
  const sourceRef = textValue(ref, label);
  invariant(sourceMap.has(sourceRef), `${label} references unknown source ${sourceRef}`);
  return sourceRef;
}

function validateAuthoritySourceRef(ref, label, sourceMap, authoritySourceRefs) {
  const sourceRef = validateSourceRef(ref, label, sourceMap);
  invariant(
    authoritySourceRefs.includes(sourceRef),
    `${label} must reference an owner-selected baseline authority source`,
  );
  return sourceRef;
}

function validateEvidenceList(values, label, sourceMap) {
  if (values === undefined) return [];
  const refs = array(values, label);
  invariant(refs.length <= 20, `${label} exceeds 20 items`);
  return refs.map((ref, index) => validateSourceRef(ref, `${label}[${index}]`, sourceMap));
}

function validateAuthorityEvidenceList(values, label, sourceMap, authoritySourceRefs) {
  return validateEvidenceList(values, label, sourceMap).map((ref, index) =>
    validateAuthoritySourceRef(ref, `${label}[${index}]`, sourceMap, authoritySourceRefs));
}

function validateGroundedEvidence(value, label, sourceRef, sourceMap) {
  const source = sourceMap.get(sourceRef);
  if (source.type !== "email") {
    return value === undefined ? null : textValue(value, label, 300);
  }
  const quote = textValue(value, label, 300);
  invariant(source.quote, `${label} requires a short quote on email source ${sourceRef}`);
  invariant(
    normalizeEvidence(source.quote).includes(normalizeEvidence(quote)),
    `${label} is not grounded in source ${sourceRef}`,
  );
  return quote;
}

function validateEffort(value, label, sourceMap) {
  if (value === undefined) return null;
  object(value, label);
  const min = finiteNumber(value.min, `${label}.min`);
  const max = finiteNumber(value.max, `${label}.max`);
  invariant(max >= min, `${label}.max must be greater than or equal to min`);
  const sourceRef = validateSourceRef(value.sourceRef, `${label}.sourceRef`, sourceMap);
  invariant(
    sourceMap.get(sourceRef).type === "user",
    `${label}.sourceRef must be an owner-supplied estimate source`,
  );
  return {
    ...range(min, max),
    sourceRef,
  };
}

function classifyItem(item) {
  switch (item.relation) {
    case "included":
      return { status: "in_scope", reason: "explicitly included within the approved baseline" };
    case "clarifies":
      return item.implementationDelta
        ? { status: "scope_change", reason: "the clarification adds material implementation work" }
        : { status: "clarification", reason: "wording clarification without implementation delta" };
    case "exceeds_limit":
      return { status: "scope_change", reason: "the request exceeds an approved quantity or limit" };
    case "excluded":
      return { status: "scope_change", reason: "the request is explicitly excluded by the approved baseline" };
    case "absent":
      return { status: "scope_change", reason: "the item is absent from the owner-confirmed complete baseline" };
    case "ambiguous":
      return item.materiality === "low" && !item.implementationDelta
        ? { status: "clarification", reason: "low-impact ambiguity without implementation delta" }
        : { status: "unknown", reason: "material ambiguity requires owner clarification" };
    case "conflicting":
      return { status: "unknown", reason: "authoritative baseline evidence conflicts" };
    default:
      throw new Error(`unsupported relation ${item.relation}`);
  }
}

function normalizeItem(raw, index, sourceMap, authoritySourceRefs, requestSourceRef) {
  object(raw, `request.items[${index}]`);
  const sourceRef = validateSourceRef(raw.sourceRef, `request.items[${index}].sourceRef`, sourceMap);
  invariant(
    sourceRef === requestSourceRef,
    `request.items[${index}].sourceRef must match request.sourceRef`,
  );
  const item = {
    id: requestItemIdValue(raw.id, `request.items[${index}].id`),
    label: textValue(raw.label, `request.items[${index}].label`, 500),
    kind: textValue(raw.kind, `request.items[${index}].kind`),
    relation: textValue(raw.relation, `request.items[${index}].relation`),
    materiality: textValue(raw.materiality, `request.items[${index}].materiality`),
    implementationDelta: raw.implementationDelta,
    sourceRef,
    evidenceQuote: validateGroundedEvidence(
      raw.evidenceQuote,
      `request.items[${index}].evidenceQuote`,
      sourceRef,
      sourceMap,
    ),
    baselineSourceRefs: validateAuthorityEvidenceList(
      raw.baselineSourceRefs,
      `request.items[${index}].baselineSourceRefs`,
      sourceMap,
      authoritySourceRefs,
    ),
    effortHours: validateEffort(raw.effortHours, `request.items[${index}].effortHours`, sourceMap),
  };

  invariant(ITEM_KINDS.has(item.kind), `request.items[${index}].kind is unsupported`);
  invariant(RELATIONS.has(item.relation), `request.items[${index}].relation is unsupported`);
  invariant(MATERIALITY.has(item.materiality), `request.items[${index}].materiality is unsupported`);
  invariant(typeof item.implementationDelta === "boolean", `request.items[${index}].implementationDelta must be boolean`);
  invariant(
    item.baselineSourceRefs.length > 0,
    `request.items[${index}].baselineSourceRefs must contain at least one authority source`,
  );
  if (item.kind === "revision") {
    item.units = finiteNumber(raw.units, `request.items[${index}].units`, { min: 1, integer: true });
  }
  return item;
}

function rowFromItem(item, classification, suffix = "") {
  return {
    id: `${item.id}${suffix}`,
    requestItemId: item.id,
    label: item.label,
    kind: item.kind,
    status: classification.status,
    reason: classification.reason,
    evidence: {
      requestSourceRef: item.sourceRef,
      quote: item.evidenceQuote,
      baselineSourceRefs: [...item.baselineSourceRefs],
    },
    ...(item.kind === "revision" ? { units: item.units } : {}),
    ...(item.effortHours ? { effortHours: { ...item.effortHours } } : {}),
  };
}

function validateTerms(values, label, sourceMap, authoritySourceRefs) {
  if (values === undefined) return [];
  const entries = array(values, label);
  invariant(entries.length <= 100, `${label} exceeds 100 items`);
  return entries.map((entry, index) => {
    object(entry, `${label}[${index}]`);
    return {
      text: textValue(entry.text, `${label}[${index}].text`),
      sourceRef: validateAuthoritySourceRef(
        entry.sourceRef,
        `${label}[${index}].sourceRef`,
        sourceMap,
        authoritySourceRefs,
      ),
    };
  });
}

function validateDeliverables(values, sourceMap, authoritySourceRefs) {
  if (values === undefined) return [];
  const ids = new Set();
  const entries = array(values, "baseline.deliverables");
  invariant(entries.length <= 100, "baseline.deliverables exceeds 100 items");
  return entries.map((entry, index) => {
    object(entry, `baseline.deliverables[${index}]`);
    const id = idValue(entry.id, `baseline.deliverables[${index}].id`);
    invariant(!ids.has(id), `baseline.deliverables contains duplicate id ${id}`);
    ids.add(id);
    return {
      id,
      label: textValue(entry.label, `baseline.deliverables[${index}].label`),
      sourceRef: validateAuthoritySourceRef(
        entry.sourceRef,
        `baseline.deliverables[${index}].sourceRef`,
        sourceMap,
        authoritySourceRefs,
      ),
    };
  });
}

function validatePricing(value, sourceMap, authoritySourceRefs) {
  if (value === undefined) return null;
  object(value, "baseline.pricing");
  const currency = textValue(value.currency, "baseline.pricing.currency").toUpperCase();
  invariant(/^[A-Z]{3,8}$/.test(currency), "baseline.pricing.currency must be a short uppercase code");
  const hoursPerWorkday = value.hoursPerWorkday === undefined
    ? 8
    : finiteNumber(value.hoursPerWorkday, "baseline.pricing.hoursPerWorkday", { min: 0.1 });

  let rate = null;
  if (value.rate !== undefined) {
    object(value.rate, "baseline.pricing.rate");
    invariant(value.rate.unit === "hour" || value.rate.unit === "day", "baseline.pricing.rate.unit must be hour or day");
    const sourceRef = validateSourceRef(value.rate.sourceRef, "baseline.pricing.rate.sourceRef", sourceMap);
    invariant(
      sourceMap.get(sourceRef).type === "user" || authoritySourceRefs.includes(sourceRef),
      "baseline.pricing.rate.sourceRef must be owner-supplied or part of the selected baseline",
    );
    rate = {
      amount: finiteNumber(value.rate.amount, "baseline.pricing.rate.amount", { min: 0.0001 }),
      unit: value.rate.unit,
      sourceRef,
    };
  }

  let rushPremium = null;
  if (value.rushPremium !== undefined) {
    object(value.rushPremium, "baseline.pricing.rushPremium");
    invariant(
      value.rushPremium.basis === "added_labor_fee",
      "baseline.pricing.rushPremium.basis must be added_labor_fee",
    );
    const sourceRef = validateSourceRef(
      value.rushPremium.sourceRef,
      "baseline.pricing.rushPremium.sourceRef",
      sourceMap,
    );
    invariant(
      sourceMap.get(sourceRef).type === "user" || authoritySourceRefs.includes(sourceRef),
      "baseline.pricing.rushPremium.sourceRef must be owner-supplied or part of the selected baseline",
    );
    rushPremium = {
      percent: finiteNumber(value.rushPremium.percent, "baseline.pricing.rushPremium.percent", { max: 1000 }),
      basis: value.rushPremium.basis,
      sourceRef,
    };
  }

  return { currency, hoursPerWorkday, rate, rushPremium };
}

function requiresEffortEstimate(row) {
  return row.status === "scope_change";
}

export function buildMarginPacket(rawInput) {
  object(rawInput, "input");
  invariant(rawInput.version === 1, "version must be 1");
  const project = object(rawInput.project, "project");
  const projectName = textValue(project.name, "project.name", 240);

  const rawSources = array(rawInput.sources, "sources");
  invariant(rawSources.length > 0 && rawSources.length <= 50, "sources must contain 1 to 50 items");
  const normalizedSources = rawSources.map(validateSource);
  const sourceMap = new Map();
  for (const source of normalizedSources) {
    invariant(!sourceMap.has(source.id), `sources contains duplicate id ${source.id}`);
    sourceMap.set(source.id, source);
  }

  const baselineInput = object(rawInput.baseline, "baseline");
  const authoritySourceRefs = validateEvidenceList(
    baselineInput.authoritySourceRefs,
    "baseline.authoritySourceRefs",
    sourceMap,
  );
  invariant(authoritySourceRefs.length > 0, "baseline.authoritySourceRefs must contain at least one source");

  const baseline = {
    authoritySourceRefs,
    deliverables: validateDeliverables(
      baselineInput.deliverables,
      sourceMap,
      authoritySourceRefs,
    ),
    exclusions: validateTerms(
      baselineInput.exclusions,
      "baseline.exclusions",
      sourceMap,
      authoritySourceRefs,
    ),
    acceptanceCriteria: validateTerms(
      baselineInput.acceptanceCriteria,
      "baseline.acceptanceCriteria",
      sourceMap,
      authoritySourceRefs,
    ),
  };

  let revisionBudget = null;
  if (baselineInput.revisionBudget !== undefined) {
    const value = object(baselineInput.revisionBudget, "baseline.revisionBudget");
    const included = finiteNumber(value.included, "baseline.revisionBudget.included", { integer: true });
    const usedBefore = finiteNumber(value.used, "baseline.revisionBudget.used", { integer: true });
    invariant(usedBefore <= included, "baseline.revisionBudget.used cannot exceed included");
    revisionBudget = {
      included,
      usedBefore,
      sourceRef: validateAuthoritySourceRef(
        value.sourceRef,
        "baseline.revisionBudget.sourceRef",
        sourceMap,
        authoritySourceRefs,
      ),
      requested: 0,
      covered: 0,
      overflow: 0,
      remainingAfter: included - usedBefore,
    };
  }

  let deadline = null;
  if (baselineInput.deadline !== undefined) {
    const value = object(baselineInput.deadline, "baseline.deadline");
    deadline = {
      date: dateValue(value.date, "baseline.deadline.date"),
      sourceRef: validateAuthoritySourceRef(
        value.sourceRef,
        "baseline.deadline.sourceRef",
        sourceMap,
        authoritySourceRefs,
      ),
    };
  }

  const pricing = validatePricing(baselineInput.pricing, sourceMap, authoritySourceRefs);
  const requestInput = object(rawInput.request, "request");
  const requestSourceRef = validateSourceRef(requestInput.sourceRef, "request.sourceRef", sourceMap);
  const requestedDeadline = requestInput.requestedDeadline === undefined
    ? null
    : dateValue(requestInput.requestedDeadline, "request.requestedDeadline");
  const rawItems = array(requestInput.items, "request.items");
  invariant(rawItems.length <= 100, "request.items exceeds 100 items");
  const normalizedItems = rawItems.map((item, index) =>
    normalizeItem(item, index, sourceMap, authoritySourceRefs, requestSourceRef));
  invariant(normalizedItems.length > 0, "request.items must contain at least one item");
  if (requestedDeadline !== null) {
    invariant(
      normalizedItems.some((item) => item.kind === "deadline"),
      "request.requestedDeadline requires an atomic deadline request item",
    );
  }
  const itemIds = new Set();
  for (const item of normalizedItems) {
    invariant(!itemIds.has(item.id), `request.items contains duplicate id ${item.id}`);
    itemIds.add(item.id);
  }

  const rows = [];
  let revisionRemaining = revisionBudget ? revisionBudget.included - revisionBudget.usedBefore : 0;
  for (const item of normalizedItems) {
    const allocatableRevision =
      item.kind === "revision" && ["included", "exceeds_limit"].includes(item.relation);
    if (!allocatableRevision) {
      rows.push(rowFromItem(item, classifyItem(item)));
      continue;
    }

    if (!revisionBudget) {
      rows.push(
        rowFromItem(item, {
          status: "unknown",
          reason: "the approved baseline has no revision allowance",
        }),
      );
      continue;
    }

    const covered = Math.min(item.units, revisionRemaining);
    const overflow = item.units - covered;
    revisionRemaining -= covered;
    revisionBudget.requested += item.units;
    revisionBudget.covered += covered;
    revisionBudget.overflow += overflow;

    if (covered > 0) {
      const row = rowFromItem(
        item,
        { status: "in_scope", reason: "covered by the remaining approved revision allowance" },
        overflow > 0 ? ":included" : "",
      );
      row.units = covered;
      if (item.effortHours) row.effortHours = { ...scaleRange(item.effortHours, covered / item.units), sourceRef: item.effortHours.sourceRef };
      rows.push(row);
    }
    if (overflow > 0) {
      const row = rowFromItem(
        item,
        { status: "scope_change", reason: "exceeds the remaining approved revision allowance" },
        covered > 0 ? ":overflow" : "",
      );
      row.units = overflow;
      if (item.effortHours) row.effortHours = { ...scaleRange(item.effortHours, overflow / item.units), sourceRef: item.effortHours.sourceRef };
      rows.push(row);
    }
  }
  if (revisionBudget) revisionBudget.remainingAfter = revisionRemaining;
  const rowIds = new Set();
  for (const row of rows) {
    invariant(!rowIds.has(row.id), `request ledger contains duplicate row id ${row.id}`);
    rowIds.add(row.id);
  }

  const rawDependencies = rawInput.dependencies === undefined ? [] : array(rawInput.dependencies, "dependencies");
  invariant(rawDependencies.length <= 50, "dependencies exceeds 50 items");
  const dependencies = rawDependencies.map(
    (entry, index) => {
      object(entry, `dependencies[${index}]`);
      const owner = textValue(entry.owner, `dependencies[${index}].owner`);
      invariant(DEPENDENCY_OWNERS.has(owner), `dependencies[${index}].owner is unsupported`);
      const sourceRef = validateSourceRef(entry.sourceRef, `dependencies[${index}].sourceRef`, sourceMap);
      return {
        id: idValue(entry.id, `dependencies[${index}].id`),
        label: textValue(entry.label, `dependencies[${index}].label`, 500),
        owner,
        delayDays: finiteNumber(entry.delayDays, `dependencies[${index}].delayDays`, { max: 3650 }),
        sourceRef,
        evidenceQuote: validateGroundedEvidence(
          entry.evidenceQuote,
          `dependencies[${index}].evidenceQuote`,
          sourceRef,
          sourceMap,
        ),
      };
    },
  );
  const dependencyIds = new Set();
  for (const dependency of dependencies) {
    invariant(!dependencyIds.has(dependency.id), `dependencies contains duplicate id ${dependency.id}`);
    dependencyIds.add(dependency.id);
  }
  const delayByOwner = { client: 0, freelancer: 0, shared: 0, unknown: 0 };
  for (const dependency of dependencies) delayByOwner[dependency.owner] += dependency.delayDays;
  for (const owner of Object.keys(delayByOwner)) delayByOwner[owner] = round(delayByOwner[owner]);

  const compressionDays = deadline && requestedDeadline && requestedDeadline < deadline.date
    ? daysBetween(requestedDeadline, deadline.date)
    : 0;
  let knownAddedHours = range(0, 0);
  const unpricedItemIds = [];
  for (const row of rows) {
    if (!requiresEffortEstimate(row)) continue;
    if (!row.effortHours) {
      unpricedItemIds.push(row.id);
      continue;
    }
    knownAddedHours = addRanges(knownAddedHours, row.effortHours);
  }

  const compressedDeadlineRows = rows.filter(
    (row) => row.status === "scope_change" && row.kind === "deadline",
  );
  if (compressionDays > 0 && compressedDeadlineRows.length > 0 && knownAddedHours.max === 0) {
    for (const row of compressedDeadlineRows) unpricedItemIds.push(row.id);
  }

  const rate = pricing?.rate ?? null;
  const effectiveHourlyRate = rate
    ? rate.unit === "hour"
      ? rate.amount
      : rate.amount / pricing.hoursPerWorkday
    : null;
  const knownBaseFeeRange = effectiveHourlyRate === null
    ? null
    : multiplyRange(knownAddedHours, effectiveHourlyRate);
  const baseComplete = rows.some((row) => row.status === "scope_change")
    ? Boolean(rate) && unpricedItemIds.length === 0
    : true;
  const completeBaseFeeRange = baseComplete ? knownBaseFeeRange ?? range(0, 0) : null;

  let rushPremiumAmountRange = compressionDays > 0 ? null : range(0, 0);
  let rushState = "not_applicable";
  if (compressionDays > 0) {
    if (pricing?.rushPremium && completeBaseFeeRange) {
      rushPremiumAmountRange = multiplyRange(
        completeBaseFeeRange,
        pricing.rushPremium.percent / 100,
      );
      rushState = "priced";
    } else {
      rushState = "approval_needed";
    }
  }
  const completeTotalFeeRange = completeBaseFeeRange && rushState !== "approval_needed"
    ? addRanges(completeBaseFeeRange, rushPremiumAmountRange)
    : null;

  const basePricingState = baseComplete ? "priced" : "approval_needed";
  const pricingState = baseComplete && rushState !== "approval_needed" ? "priced" : "approval_needed";
  const hoursPerWorkday = pricing?.hoursPerWorkday ?? 8;
  const clientDelayCalendarDays = Math.ceil(delayByOwner.client);
  const extensionDays = baseComplete
    ? {
        min: Math.ceil(knownAddedHours.min / hoursPerWorkday) + clientDelayCalendarDays,
        max: Math.ceil(knownAddedHours.max / hoursPerWorkday) + clientDelayCalendarDays,
      }
    : null;

  const scopeChanges = rows.filter((row) => row.status === "scope_change");
  const unknowns = rows.filter((row) => row.status === "unknown");
  const clarifications = rows.filter((row) => row.status === "clarification");
  const state = unknowns.length > 0
    ? "clarification_needed"
    : scopeChanges.length > 0
      ? "scope_change_detected"
      : clarifications.length > 0
        ? "clarification_needed"
        : "in_scope";

  const options = [];
  if (scopeChanges.length > 0 && unknowns.length === 0) {
    options.push({
      id: "remove_or_swap",
      title: "Remove or swap added scope",
      pricingState: "not_applicable",
      feeRange: pricing ? range(0, 0) : null,
      deadline: deadline?.date ?? null,
      note: "Remove additions or confirm an effort-equivalent swap before work starts.",
    });

    const extendedDeadlineRange = deadline && extensionDays
      ? {
          earliest: addCalendarDays(deadline.date, extensionDays.min),
          latest: addCalendarDays(deadline.date, extensionDays.max),
        }
      : null;
    options.push({
      id: "extend_schedule",
      title: "Keep additions and extend the schedule",
      pricingState: basePricingState,
      feeRange: completeBaseFeeRange,
      extensionDays,
      deadlineRange: extendedDeadlineRange,
      note: "Use the ordinary owner-approved rate and include explicitly attributed client delay.",
    });
    options.push({
      id: "paid_change_order",
      title: "Approve a paid change order at the requested deadline",
      pricingState,
      feeRange: completeTotalFeeRange,
      deadline: requestedDeadline ?? deadline?.date ?? null,
      note:
        compressionDays > 0
          ? "Includes only an owner-approved rush rule; otherwise pricing remains approval_needed."
          : "Uses the owner-approved pricing basis without a rush premium.",
    });
  }

  const packet = {
    schemaVersion: 1,
    project: { name: projectName },
    state,
    sources: normalizedSources,
    baseline: {
      ...baseline,
      revisionBudget,
      deadline,
      pricing,
    },
    request: {
      sourceRef: requestSourceRef,
      requestedDeadline,
      compressionDays,
    },
    requestLedger: rows,
    marginSnapshot: {
      knownAddedHours,
      unpricedItemIds,
      rate,
      effectiveHourlyRate: effectiveHourlyRate === null ? null : round(effectiveHourlyRate),
      currency: pricing?.currency ?? null,
      rateSourceRef: rate?.sourceRef ?? null,
      knownBaseFeeRange,
      completeBaseFeeRange,
      feeAtRiskRange: knownBaseFeeRange,
      basePricingState,
      rushPremium: pricing?.rushPremium ?? null,
      rushPremiumAmountRange,
      rushState,
      completeTotalFeeRange,
      pricingState,
    },
    delayAttribution: {
      events: dependencies,
      totalDaysByOwner: delayByOwner,
    },
    clientOptions: options,
  };

  const evidencePayload = {
    sources: normalizedSources,
    authoritySourceRefs,
    requestSourceRef,
    requestLedger: rows.map((row) => ({
      id: row.id,
      status: row.status,
      evidence: row.evidence,
    })),
    dependencies,
  };

  return {
    ...packet,
    integrity: {
      algorithm: "sha256",
      canonicalization: "sorted-json-v1",
      evidenceDigest: sha256(evidencePayload),
      packetDigest: sha256(packet),
    },
  };
}

function escapeMarkdownText(value) {
  return String(value)
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, " ")
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]{}#!|])/gu, "\\$1")
    .replace(/\b(https?|mailto):/giu, "$1&#58;");
}

function escapeCell(value) {
  return escapeMarkdownText(value);
}

function formatRange(value, unit = "") {
  if (!value) return "approval_needed";
  const suffix = unit ? ` ${unit}` : "";
  return value.min === value.max ? `${value.min}${suffix}` : `${value.min}–${value.max}${suffix}`;
}

function formatMoney(value, currency) {
  return value && currency ? `${formatRange(value)} ${currency}` : "approval_needed";
}

export function renderMarkdown(packet) {
  const lines = [
    `# Freelance Margin Guard — ${escapeMarkdownText(packet.project.name)}`,
    "",
    `**State:** \`${packet.state}\``,
    "",
    "## Baseline",
    "",
    `Authority: ${packet.baseline.authoritySourceRefs.map((ref) => `\`${ref}\``).join(", ")}`,
    "",
    "### Deliverables",
    "",
    ...(packet.baseline.deliverables.length
      ? packet.baseline.deliverables.map((item) => `- ${escapeMarkdownText(item.label)} (\`${item.sourceRef}\`)`)
      : ["- None recorded"]),
    "",
    "### Exclusions",
    "",
    ...(packet.baseline.exclusions.length
      ? packet.baseline.exclusions.map((item) => `- ${escapeMarkdownText(item.text)} (\`${item.sourceRef}\`)`)
      : ["- None recorded"]),
    "",
    "### Acceptance criteria",
    "",
    ...(packet.baseline.acceptanceCriteria.length
      ? packet.baseline.acceptanceCriteria.map((item) => `- ${escapeMarkdownText(item.text)} (\`${item.sourceRef}\`)`)
      : ["- None recorded"]),
    "",
    "### Commercial terms",
    "",
    `- Deadline: ${packet.baseline.deadline ? `**${packet.baseline.deadline.date}** (\`${packet.baseline.deadline.sourceRef}\`)` : "not recorded"}`,
    `- Currency: ${packet.baseline.pricing?.currency ?? "not recorded"}`,
    `- Rate: ${packet.baseline.pricing?.rate ? `**${packet.baseline.pricing.rate.amount} ${packet.baseline.pricing.currency}/${packet.baseline.pricing.rate.unit}** (\`${packet.baseline.pricing.rate.sourceRef}\`)` : "approval_needed"}`,
    `- Hours per workday: ${packet.baseline.pricing?.hoursPerWorkday ?? "not recorded"}`,
    `- Rush rule: ${packet.baseline.pricing?.rushPremium ? `**${packet.baseline.pricing.rushPremium.percent}%** of added labor fee (\`${packet.baseline.pricing.rushPremium.sourceRef}\`)` : "approval_needed"}`,
    "",
  ];

  if (packet.baseline.revisionBudget) {
    const revision = packet.baseline.revisionBudget;
    lines.push(
      "### Revision budget",
      "",
      "| Included | Used before | Requested | Covered | Overflow | Remaining after | Source |",
      "| ---: | ---: | ---: | ---: | ---: | ---: | --- |",
      `| ${revision.included} | ${revision.usedBefore} | ${revision.requested} | ${revision.covered} | ${revision.overflow} | ${revision.remainingAfter} | \`${revision.sourceRef}\` |`,
      "",
    );
  }

  lines.push(
    "## Request ledger",
    "",
    "| Item | Status | Reason | Effort | Estimate source | Evidence |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...packet.requestLedger.map((row) =>
      `| ${escapeCell(row.label)}${row.units ? ` (${row.units})` : ""} | \`${row.status}\` | ${escapeCell(row.reason)} | ${row.effortHours ? formatRange(row.effortHours, "h") : "—"} | ${row.effortHours ? `\`${row.effortHours.sourceRef}\`` : "—"} | ${row.evidence.quote ? `“${escapeCell(row.evidence.quote)}” ` : ""}(\`${row.evidence.requestSourceRef}\`) |`),
    "",
    "## Margin snapshot",
    "",
    `- Known added effort: **${formatRange(packet.marginSnapshot.knownAddedHours, "hours")}**`,
    `- Fee at risk: **${formatMoney(packet.marginSnapshot.feeAtRiskRange, packet.marginSnapshot.currency)}**`,
    `- Complete base fee: **${formatMoney(packet.marginSnapshot.completeBaseFeeRange, packet.marginSnapshot.currency)}**`,
    `- Rush premium: **${formatMoney(packet.marginSnapshot.rushPremiumAmountRange, packet.marginSnapshot.currency)}** (\`${packet.marginSnapshot.rushState}\`)`,
    `- Complete requested-deadline fee: **${formatMoney(packet.marginSnapshot.completeTotalFeeRange, packet.marginSnapshot.currency)}**`,
    `- Rate provenance: ${packet.marginSnapshot.rateSourceRef ? `\`${packet.marginSnapshot.rateSourceRef}\`` : "approval_needed"}`,
    `- Unpriced items: ${packet.marginSnapshot.unpricedItemIds.length ? packet.marginSnapshot.unpricedItemIds.map((id) => `\`${id}\``).join(", ") : "none"}`,
    `- Deadline compression: **${packet.request.compressionDays} calendar days**`,
    "",
    "## Delay attribution",
    "",
    "| Dependency | Owner | Supplied delay | Source |",
    "| --- | --- | ---: | --- |",
    ...(packet.delayAttribution.events.length
      ? packet.delayAttribution.events.map((event) =>
          `| ${escapeCell(event.label)} | \`${event.owner}\` | ${event.delayDays} days | ${event.evidenceQuote ? `“${escapeCell(event.evidenceQuote)}” ` : ""}(\`${event.sourceRef}\`) |`)
      : ["| None recorded | — | 0 days | — |"]),
    "",
    "## Client options",
    "",
    "| Option | Pricing | Additional fee | Deadline / extension | Conditions |",
    "| --- | --- | ---: | --- | --- |",
    ...(packet.clientOptions.length
      ? packet.clientOptions.map((option) => {
          const timing = option.deadlineRange
            ? `${option.deadlineRange.earliest}–${option.deadlineRange.latest}`
            : option.deadline ?? "approval_needed";
          return `| \`${option.id}\` — ${escapeCell(option.title)} | \`${option.pricingState}\` | ${formatMoney(option.feeRange, packet.marginSnapshot.currency)} | ${timing} | ${escapeCell(option.note)} |`;
        })
      : ["| Withheld until material unknowns are resolved | `approval_needed` | approval_needed | approval_needed | Resolve material evidence first. |"]),
    "",
    "## Integrity",
    "",
    `- Evidence digest: \`${packet.integrity.evidenceDigest}\``,
    `- Packet digest: \`${packet.integrity.packetDigest}\``,
    `- Algorithm: \`${packet.integrity.algorithm}\` with \`${packet.integrity.canonicalization}\``,
    "",
    "Extra work starts only after written approval of the selected option.",
  );

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const result = { input: null, format: "json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") result.input = argv[++index];
    else if (arg === "--format") result.format = argv[++index];
    else if (arg === "--help" || arg === "-h") result.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!result.help) {
    invariant(result.input, "--input is required");
    invariant(result.format === "json" || result.format === "markdown", "--format must be json or markdown");
  }
  return result;
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "Usage: build-margin-packet.mjs --input <file|-> [--format json|markdown]\n",
    );
    return;
  }
  const raw = args.input === "-" ? await readStdin() : await readFile(args.input, "utf8");
  const packet = buildMarginPacket(JSON.parse(raw));
  process.stdout.write(
    args.format === "markdown" ? renderMarkdown(packet) : `${JSON.stringify(packet, null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Freelance Margin Guard: ${error.message}\n`);
    process.exitCode = 1;
  });
}
