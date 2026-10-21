import ICAL from "ical.js";

const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MAX_ICS_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function propertyRows(component) {
  return component.getAllProperties().map((property) => {
    const json = property.toJSON();
    return { name: json[0], params: stable(json[1] ?? {}), type: json[2], values: stable(json.slice(3)) };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function exactlyOne(component, name) {
  const properties = component.getAllProperties(name);
  if (properties.length !== 1) return { value: null, reason: `${name.toUpperCase()} must occur exactly once` };
  return { value: properties[0].getFirstValue(), reason: null };
}

function utcProperty(component, name) {
  const properties = component.getAllProperties(name);
  if (properties.length !== 1) return { value: null, reason: `${name.toUpperCase()} must occur exactly once` };
  const property = properties[0];
  const raw = property.toJSON();
  const params = raw[1] ?? {};
  const value = raw[3];
  if (params.TZID || params.tzid || raw[2] !== "date-time" || typeof value !== "string" || !UTC_RE.test(value)) {
    return { value: null, reason: `${name.toUpperCase()} must be a UTC date-time` };
  }
  return { value, reason: null };
}

function normalizeOrganizer(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function validUtc(value) {
  if (!UTC_RE.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace(".000", "") === value;
}

function normalizeEvent(component) {
  const names = new Set(component.getAllProperties().map((p) => p.name));
  const forbidden = ["rrule", "recurrence-id", "rdate", "exdate"].find((name) => names.has(name));
  if (forbidden) return { error: `${forbidden.toUpperCase()} is not supported` };
  const uidField = exactlyOne(component, "uid");
  const organizerField = exactlyOne(component, "organizer");
  const sequenceField = exactlyOne(component, "sequence");
  for (const field of [uidField, organizerField, sequenceField]) if (field.reason) return { error: field.reason };
  const uid = uidField.value;
  const organizer = normalizeOrganizer(organizerField.value);
  const sequence = sequenceField.value;
  const stamp = utcProperty(component, "dtstamp");
  const start = utcProperty(component, "dtstart");
  const end = utcProperty(component, "dtend");
  if (typeof uid !== "string" || !uid.trim() || uid.includes("\u0000")) return { error: "invalid UID" };
  if (!organizer || organizer.includes("\u0000")) return { error: "invalid ORGANIZER" };
  if (!Number.isSafeInteger(sequence) || sequence < 0) return { error: "SEQUENCE must be a nonnegative safe integer" };
  for (const item of [stamp, start, end]) if (item.reason) return { error: item.reason };
  const startTime = Date.parse(start.value);
  const endTime = Date.parse(end.value);
  if (!validUtc(stamp.value) || !validUtc(start.value) || !validUtc(end.value)) {
    return { error: "DTSTAMP, DTSTART, and DTEND must be valid UTC date-times" };
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return { error: "DTSTART and DTEND must be valid UTC date-times" };
  }
  if (endTime <= startTime) return { error: "DTEND must be after DTSTART" };
  const rows = propertyRows(component).filter((row) => row.name !== "dtstamp");
  const canonical = JSON.stringify(stable(rows));
  return { uid: String(uid), organizer, sequence, dtstamp: stamp.value, dtstart: start.value, dtend: end.value, canonical };
}

export function parseInvite(ics) {
  try {
    if (typeof ics !== "string" || Buffer.byteLength(ics, "utf8") > MAX_ICS_BYTES) return { ok: false, reason: "ICS exceeds 1 MiB limit" };
    const parsed = ICAL.parse(ics);
    const calendar = new ICAL.Component(parsed);
    const method = calendar.getAllProperties("method");
    if (method.length !== 1 || method[0].getFirstValue() !== "REQUEST") return { ok: false, reason: "METHOD must be REQUEST" };
    const events = calendar.getAllSubcomponents("vevent");
    if (events.length !== 1) return { ok: false, reason: "ICS must contain exactly one VEVENT" };
    const event = normalizeEvent(events[0]);
    return event.error ? { ok: false, reason: event.error } : { ok: true, event };
  } catch (error) {
    return { ok: false, reason: `invalid ICS: ${error.message}` };
  }
}

// A prior winner is a normalized record returned by this helper, not a trusted
// calendar authority. Rebuild it from its canonical content and revalidate every
// comparison field so arbitrary maps cannot silently authorize downstream use.
function validatePrior(prior) {
  const fail = (reason) => ({ ok: false, reason });
  if (!prior || typeof prior !== "object" || Array.isArray(prior) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(prior))) return fail("prior state unavailable or malformed");
  const entries = Object.entries(prior);
  if (entries.length > 100) return fail("prior state exceeds 100-event limit");
  const winners = new Map();
  const uids = new Set();
  let bytes = 0;
  try {
    for (const [key, event] of entries) {
      if (!event || typeof event !== "object" || Array.isArray(event) ||
          Object.keys(event).sort().join(",") !== "canonical,dtend,dtstamp,dtstart,organizer,sequence,uid" ||
          typeof event.canonical !== "string" || Buffer.byteLength(event.canonical, "utf8") > MAX_ICS_BYTES ||
          typeof event.uid !== "string" || !event.uid.trim() || event.uid.includes("\u0000") ||
          typeof event.organizer !== "string" || !event.organizer || event.organizer.includes("\u0000") ||
          normalizeOrganizer(event.organizer) !== event.organizer ||
          key !== `${event.uid}\u0000${event.organizer}`) return fail("prior event identity or schema is invalid");
      bytes += Buffer.byteLength(JSON.stringify([key, event]), "utf8");
      if (bytes > MAX_TOTAL_BYTES) return fail("prior state exceeds 5 MiB limit");
      if (uids.has(event.uid)) return fail("prior state has conflicting organizers for the same UID");
      uids.add(event.uid);
      const rows = JSON.parse(event.canonical);
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" ||
          Object.keys(row).sort().join(",") !== "name,params,type,values" ||
          typeof row.name !== "string" || typeof row.type !== "string" ||
          !row.params || typeof row.params !== "object" || Array.isArray(row.params) ||
          !Array.isArray(row.values) || row.name === "dtstamp")) return fail("prior canonical content is invalid");
      const component = new ICAL.Component(["vevent", [
        ...rows.map((row) => [row.name, row.params, row.type, ...row.values]),
        ["dtstamp", {}, "date-time", event.dtstamp],
      ], []]);
      const normalized = normalizeEvent(component);
      if (normalized.error || Object.keys(normalized).some((field) => normalized[field] !== event[field])) {
        return fail("prior canonical content disagrees with event fields or is invalid");
      }
      winners.set(key, normalized);
    }
  } catch {
    return fail("prior event content could not be validated");
  }
  return { ok: true, winners };
}

export function reconcileInvites(inputs, prior) {
  if (!Array.isArray(inputs)) throw new TypeError("inputs must be an array");
  if (inputs.length > 100) throw new RangeError("at most 100 invitation versions may be reconciled");
  const totalBytes = inputs.reduce((sum, input) => sum + Buffer.byteLength(typeof input?.ics === "string" ? input.ics : "", "utf8"), 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new RangeError("invitation inputs exceed 5 MiB total limit");
  const validatedPrior = validatePrior(arguments.length < 2 ? {} : prior);
  if (!validatedPrior.ok) {
    return {
      decisions: [{ label: "prior", decision: "needs_review", reason: validatedPrior.reason }],
      winners: {}, unresolved: {}, hasReview: true, safeToUseWinners: false,
    };
  }
  const winners = validatedPrior.winners;
  const unresolved = new Map();
  const decisions = [];
  for (const input of inputs) {
    const label = typeof input?.label === "string" ? input.label : "input";
    const parsed = parseInvite(input?.ics ?? "");
    if (!parsed.ok) {
      decisions.push({ label, decision: "needs_review", reason: parsed.reason });
      continue;
    }
    const event = parsed.event;
    const key = `${event.uid}\u0000${event.organizer}`;
    if (unresolved.has(event.uid)) {
      decisions.push({ label, decision: "needs_review", uid: event.uid, sequence: event.sequence, reason: "UID already has an unresolved conflict" });
      continue;
    }
    const priorKey = [...winners.keys()].find((candidate) => candidate.startsWith(`${event.uid}\u0000`));
    const previous = priorKey ? winners.get(priorKey) : undefined;
    if (!previous) {
      winners.set(key, event);
      decisions.push({ label, decision: "accepted", uid: event.uid, sequence: event.sequence, reason: "first valid version" });
      continue;
    }
    if (event.organizer !== previous.organizer) {
      winners.delete(priorKey);
      unresolved.set(event.uid, { reason: "ORGANIZER differs for the same UID", candidates: [previous, event] });
      decisions.push({ label, decision: "needs_review", uid: event.uid, sequence: event.sequence, reason: "ORGANIZER differs for the same UID" });
      continue;
    }
    if (event.sequence < previous.sequence) {
      decisions.push({ label, decision: "stale_ignored", uid: event.uid, sequence: event.sequence, reason: `older than accepted sequence ${previous.sequence}` });
      continue;
    }
    if (event.sequence > previous.sequence) {
      winners.set(key, event);
      decisions.push({ label, decision: "accepted", uid: event.uid, sequence: event.sequence, reason: `newer than accepted sequence ${previous.sequence}` });
      continue;
    }
    if (event.canonical === previous.canonical) {
      decisions.push({ label, decision: "duplicate", uid: event.uid, sequence: event.sequence, reason: "same sequence and event content" });
    } else {
      winners.delete(key);
      unresolved.set(event.uid, { reason: "same sequence with different event content", candidates: [previous, event] });
      decisions.push({ label, decision: "needs_review", uid: event.uid, sequence: event.sequence, reason: "same sequence with different event content" });
    }
  }
  const hasReview = decisions.some((decision) => decision.decision === "needs_review");
  return { decisions, winners: Object.fromEntries(winners), unresolved: Object.fromEntries(unresolved), hasReview, safeToUseWinners: !hasReview && unresolved.size === 0 };
}
