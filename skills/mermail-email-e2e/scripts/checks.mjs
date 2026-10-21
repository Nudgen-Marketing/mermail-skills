// Deterministic checks for one received transactional email.
// Pure functions only: no network, no filesystem. The runner and the unit tests both import this file.

export const STATUS = Object.freeze({ PASS: "pass", WARN: "warn", FAIL: "fail", INFO: "info", SKIP: "skip" });

const GMAIL_CLIP_BYTES = 102 * 1024;
const MAX_SUBJECT_CHARS = 78;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

// Template syntaxes that should never survive rendering, plus JavaScript values leaking into copy.
const TOKEN_PATTERNS = [
  { name: "mustache/handlebars", re: /\{\{\{?\s*[#/^>!&]?[\w.$@-]*\s*\}?\}\}/g },
  { name: "jinja/liquid tag", re: /\{%-?\s*[\s\S]{1,80}?-?%\}/g },
  { name: "erb/ejs", re: /<%[=-]?[\s\S]{1,80}?%>/g },
  { name: "js template literal", re: /\$\{\s*[\w.$[\]'"]+\s*\}/g },
  { name: "mailchimp merge tag", re: /\*\|[A-Z0-9_:]+\|\*/g },
  { name: "mailgun/sendgrid variable", re: /%recipient(?:\.[\w-]+)?%|(?<![\w-])-[a-z]+(?:_[a-z]+)+-(?![\w-])/g },
  { name: "leaked JS value", re: /\[object Object\]|\bundefined\b|\bNaN\b/g },
];

// Values that mean the code put a missing variable into a URL.
const BAD_PARAM_VALUES = new Set(["", "undefined", "null", "nan", "[object object]", "none", "false"]);

/**
 * Normalize a Mermail get_email record (or a test fixture) into the shape the checks use.
 * Mermail returns one `body` string; some records also carry `html`/`text`. Raw headers are optional.
 */
export function normalizeMessage(record, { capture = "inbox" } = {}) {
  const r = record ?? {};
  const unavailable = r.content_omitted || r.content_truncated || r.body_storage_status === "deleted";
  const safe = !unavailable && (r.scan_status === "clean" || (capture === "sent" && r.scan_status == null));
  // Do not even parse blocked content. Outbound scan exemption is selected by the caller,
  // after binding the returned id, folder and recipient to the selected Sent copy.
  if (!safe) return {
    id: r.id ?? null, scanStatus: r.scan_status ?? null, contentOmitted: true,
    subject: "", from: "", to: "", date: r.date ?? null, html: "", text: "",
    headers: {}, senderAuthentication: r.sender_authentication ?? null, attachments: [], hasTextAlternative: null,
  };
  const body = typeof r.body === "string" ? r.body : "";
  const looksHtml = r.body_format ? r.body_format === "html" : /<\s*(html|body|p|div|a|table|br)\b/i.test(body);
  const html = typeof r.html === "string" ? r.html : looksHtml ? body : "";
  const text = typeof r.text === "string" ? r.text : !looksHtml ? body : "";
  const headers = parseHeaders(r.raw_headers ?? r.headers);
  return {
    id: r.id ?? null,
    subject: typeof r.subject === "string" ? r.subject : "",
    from: normalizeAddress(r.sender ?? r.from),
    to: normalizeAddress(r.recipient ?? r.to),
    date: r.date ?? null,
    html,
    text,
    headers,
    scanStatus: r.scan_status ?? null,
    contentOmitted: Boolean(r.content_omitted),
    senderAuthentication: r.sender_authentication ?? null,
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    hasTextAlternative: detectTextAlternative({ html, text, headers, record: r }),
  };
}

export function normalizeAddress(value) {
  if (!value) return "";
  const raw = typeof value === "object" ? value.email ?? value.address ?? "" : String(value);
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim().toLowerCase();
}

function parseHeaders(raw) {
  const out = {};
  if (!raw) return out;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    return out;
  }
  if (typeof raw === "string" && raw.trimStart().startsWith("[")) {
    try {
      return parseHeaders(JSON.parse(raw)); // Mermail returns raw_headers as a JSON-encoded [{key, value}] array
    } catch {}
  }
  if (Array.isArray(raw)) {
    for (const h of raw) {
      const name = h?.key ?? h?.name;
      if (name) out[String(name).toLowerCase()] = String(h.value ?? "");
    }
    return out;
  }
  // RFC 5322 block with folded continuation lines.
  const unfolded = String(raw).replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

// true / false, or null when the record does not say (no text field and no Content-Type header).
function detectTextAlternative({ html, text, headers, record }) {
  if (typeof record.text === "string" && record.text.trim()) return true;
  if (typeof record.text_body === "string" && record.text_body.trim()) return true;
  if (!html && text.trim()) return true; // plain-text-only email
  const contentType = headers["content-type"];
  if (/^text\/html/i.test(contentType ?? "")) return false;
  // A multipart wrapper does not prove that a text/plain child exists.
  if (/^text\/plain/i.test(contentType ?? "")) return true;
  return null;
}

/** Visible text of an HTML document (good enough for token and content checks). */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** Every link in the message: anchors in HTML plus bare URLs in the text part. */
export function extractLinks(message) {
  const links = [];
  const seen = new Set();
  const anchor = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of message.html.matchAll(anchor)) {
    const href = decodeEntities(m[2].trim());
    links.push({ href, label: htmlToText(m[3]).slice(0, 200), source: "html" });
    seen.add(href);
  }
  const bare = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  for (const m of message.text.matchAll(bare)) {
    const href = m[0].replace(/[.,;:!?]+$/, "");
    if (!seen.has(href)) {
      links.push({ href, label: "", source: "text" });
      seen.add(href);
    }
  }
  return links;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/");
}

export function parseUrl(href) {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

export function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".test");
}

/** host[:port] allowlist match. "acme.com" also allows "app.acme.com"; never substring matches. */
export function hostAllowed(url, allowlist) {
  const host = url.hostname.toLowerCase();
  const hostPort = url.port ? `${host}:${url.port}` : host;
  return allowlist.some((entry) => {
    const e = String(entry).toLowerCase();
    if (e.includes(":")) return e === hostPort;
    return host === e || host.endsWith(`.${e}`);
  });
}

export function findUnrenderedTokens(str) {
  const hits = [];
  for (const { name, re } of TOKEN_PATTERNS) {
    for (const m of str.matchAll(re)) {
      const start = Math.max(0, m.index - 24);
      hits.push({ kind: name, token: m[0], context: str.slice(start, m.index + m[0].length + 24).replace(/\s+/g, " ").trim() });
    }
  }
  return dedupe(hits, (h) => `${h.kind}:${h.token}`);
}

function dedupe(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function matchesExpectation(actual, expected) {
  if (expected == null) return true;
  const rx = toRegExp(expected);
  return rx ? rx.test(actual) : actual === expected;
}

/** "/pattern/flags" strings become RegExps; anything else is an exact string. */
export function toRegExp(value) {
  if (value instanceof RegExp) return value;
  const m = typeof value === "string" && value.match(/^\/(.+)\/([a-z]*)$/s);
  return m ? new RegExp(m[1], m[2]) : null;
}

/** No recoverable OTP prefix, suffix, length or hash in reports. */
export function redact() {
  return "[redacted]";
}

export function redactUrl(href) {
  const url = parseUrl(href);
  if (!url || !["http:", "https:"].includes(url.protocol)) return "[redacted URL]";
  return `${url.origin}/[redacted]`;
}

export function usableLink(url, ctx = {}) {
  return Boolean(url && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
    (url.protocol === "https:" || (ctx.mode === "dev" && isLocalHost(url.hostname))) &&
    (ctx.linkHosts?.length ? hostAllowed(url, ctx.linkHosts) : ctx.mode === "dev" && isLocalHost(url.hostname)) &&
    !/(?:unsubscribe|checkout|payment|delete[-_]?account|account[-_/]?(?:delete|remov))/i.test(decodeURIComponentSafe(url.pathname)));
}

function decodeURIComponentSafe(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function candidateMatches(e, { address, expect = {}, windowStart, windowEnd, folder, baseline = new Set() }) {
  if (!e || typeof e.id !== "string" || !e.id || baseline.has(e.id)) return false;
  if (String(e.folder_id ?? e.folder_name ?? e.folder ?? "").toLowerCase() !== folder) return false;
  const recipients = [].concat(e.recipient ?? e.to ?? []).flatMap((v) => String(v).split(/[,;]/)).map(normalizeAddress);
  if (!recipients.includes(address)) return false;
  const date = Date.parse(e.date);
  if (!Number.isFinite(date) || date < Date.parse(windowStart) || date > windowEnd) return false;
  return !expect.subject || matchesExpectation(e.subject ?? "", expect.subject);
}

function result(id, title, status, detail, extra = {}) {
  return { id, title, status, detail, ...extra };
}

/**
 * Run every content-level check for one selected message.
 * @param {object} message  normalizeMessage() output
 * @param {object} expect   the flow's `expect` block from the spec
 * @param {object} ctx      { linkHosts, mode: "dev"|"staging"|"production", kind: "transactional"|"marketing", vars }
 */
export function runMessageChecks(message, expect = {}, ctx = {}) {
  const out = [];
  const linkHosts = ctx.linkHosts ?? [];
  const mode = ctx.mode ?? "dev";
  const kind = ctx.kind ?? "transactional";

  // Security signals first: they gate how much the rest of the report means.
  if (ctx.capture === "sent" && message.scanStatus == null) out.push(result("SEC-001", "Content scan is clean", STATUS.INFO, "outbound copy read from Sent: Mermail scans inbound mail only"));
  else if (message.scanStatus === "clean") out.push(result("SEC-001", "Content scan is clean", STATUS.PASS, "scan_status=clean"));
  else if (message.scanStatus === "flagged") out.push(result("SEC-001", "Content scan is clean", STATUS.FAIL, "scan_status=flagged: Mermail quarantined this message"));
  else out.push(result("SEC-001", "Content scan is clean", STATUS.FAIL, "inbound scan is not clean; content checks stopped"));

  const auth = message.senderAuthentication?.status;
  if (auth === "pass") out.push(result("SEC-002", "Sender authentication", STATUS.PASS, "sender_authentication.status=pass"));
  else if (auth === "fail") out.push(result("SEC-002", "Sender authentication", STATUS.FAIL, "sender_authentication.status=fail: fix SPF/DKIM/DMARC for the sending domain"));
  else out.push(result("SEC-002", "Sender authentication", STATUS.INFO, `sender_authentication.status=${auth ?? "missing"}: not verifiable on this receiving path (unknown is not pass)`));

  if (message.contentOmitted || message.contentTruncated || message.bodyStorageStatus === "deleted" ||
      !(message.scanStatus === "clean" || (ctx.capture === "sent" && message.scanStatus == null))) {
    out.push(result("CNT-000", "Body available for checks", STATUS.FAIL, "Mermail omitted the body (content_omitted); content and link checks skipped"));
    return out;
  }
  const visibleText = [htmlToText(message.html), message.text].filter(Boolean).join("\n");

  // Envelope.
  if (expect.from) {
    const ok = message.from === normalizeAddress(expect.from);
    out.push(result("HDR-001", "From address", ok ? STATUS.PASS : STATUS.FAIL, ok ? message.from : `expected ${normalizeAddress(expect.from)}, got ${message.from || "(none)"}`));
  }
  if (expect.subject) {
    const ok = matchesExpectation(message.subject, expect.subject);
    out.push(result("HDR-002", "Subject", ok ? STATUS.PASS : STATUS.FAIL, ok ? message.subject : `expected ${expect.subject}, got "${message.subject}"`));
  }
  const subjectLen = [...message.subject].length;
  out.push(
    !subjectLen
      ? result("HDR-003", "Subject length", STATUS.FAIL, "subject is empty")
      : result("HDR-003", "Subject length", subjectLen > MAX_SUBJECT_CHARS ? STATUS.WARN : STATUS.PASS, `${subjectLen} chars${subjectLen > MAX_SUBJECT_CHARS ? ` (> ${MAX_SUBJECT_CHARS}, truncated on mobile)` : ""}`),
  );

  // Content.
  const subjectTokens = findUnrenderedTokens(message.subject);
  const bodyTokens = findUnrenderedTokens(visibleText);
  const hrefTokens = findUnrenderedTokens(extractLinks(message).map((l) => l.href).join("\n"));
  const tokens = dedupe([...subjectTokens, ...bodyTokens, ...hrefTokens], (h) => h.token);
  out.push(
    tokens.length
      ? result("CNT-001", "No unrendered template tokens", STATUS.FAIL, `${tokens.length} template token(s); surrounding content withheld`)
      : result("CNT-001", "No unrendered template tokens", STATUS.PASS, "no {{…}}, {%…%}, <%…%>, ${…}, *|…|*, undefined, NaN or [object Object]"),
  );

  const mustContain = [].concat(expect.contains ?? []);
  if (mustContain.length) {
    const missing = mustContain.filter((s) => !matchesExpectation(visibleText, toRegExp(s) ? s : `/${escapeRegExp(s)}/`));
    out.push(result("CNT-002", "Expected content present", missing.length ? STATUS.FAIL : STATUS.PASS, missing.length ? `missing: ${missing.join(", ")}` : mustContain.join(", ")));
  }

  const forbidden = ["lorem ipsum", "TODO", "FIXME", "test@example.com", ...[].concat(expect.notContains ?? [])];
  const present = forbidden.filter((s) => (toRegExp(s) ?? new RegExp(escapeRegExp(s), "i")).test(visibleText));
  out.push(result("CNT-003", "No placeholder or forbidden copy", present.length ? STATUS.FAIL : STATUS.PASS, present.length ? `found: ${present.join(", ")}` : "clean"));

  if (message.hasTextAlternative === null) {
    out.push(result("CNT-004", "Plain-text alternative", expect.requireText ? STATUS.FAIL : STATUS.INFO, "text/plain part not proven by this record"));
  } else {
    out.push(
      message.hasTextAlternative
        ? result("CNT-004", "Plain-text alternative", STATUS.PASS, "text part present")
        : result("CNT-004", "Plain-text alternative", expect.requireText ? STATUS.FAIL : STATUS.WARN, "HTML-only email: add a text/plain part (spam score, accessibility, text clients)"),
    );
  }

  const htmlBytes = new TextEncoder().encode(message.html).length;
  out.push(result("CNT-005", "HTML size under Gmail clip limit", htmlBytes > GMAIL_CLIP_BYTES ? STATUS.WARN : STATUS.PASS, `${(htmlBytes / 1024).toFixed(1)} KB of 102 KB`));

  const imgs = [...message.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const noAlt = imgs.filter((tag) => !/\balt\s*=\s*(["'])[^"']*\1/i.test(tag));
  out.push(result("CNT-006", "Images have alt text", noAlt.length ? STATUS.WARN : STATUS.PASS, imgs.length ? `${imgs.length - noAlt.length}/${imgs.length} images have alt` : "no images"));

  // Links.
  const links = extractLinks(message);
  const httpLinks = links.filter((l) => /^https?:/i.test(l.href));
  const insecure = [];
  const offList = [];
  const mismatched = [];
  for (const link of httpLinks) {
    const url = parseUrl(link.href);
    if (!url) {
      offList.push(`${link.href} (unparseable)`);
      continue;
    }
    const local = isLocalHost(url.hostname);
    if (url.protocol !== "https:" && !(local && mode === "dev")) insecure.push(redactUrl(link.href));
    if (local && mode !== "dev") offList.push(`${redactUrl(link.href)} (local host in ${mode})`);
    else if (linkHosts.length && !hostAllowed(url, linkHosts)) offList.push(redactUrl(link.href));
    const labelUrl = parseUrl(link.label.trim().match(/^(https?:\/\/\S+|[\w-]+(\.[\w-]+)+\S*)$/i)?.[0]?.replace(/^(?!https?:)/i, "https://") ?? "");
    if (labelUrl && labelUrl.hostname !== url.hostname) mismatched.push(`"${link.label}" → ${url.hostname}`);
  }
  const broken = links.filter((l) => !l.href || l.href === "#" || /^javascript:/i.test(l.href));
  out.push(result("LNK-001", "Links use HTTPS", insecure.length ? STATUS.FAIL : STATUS.PASS, insecure.length ? insecure.join(", ") : `${httpLinks.length} link(s) ok${mode === "dev" ? " (http allowed for local dev hosts)" : ""}`));
  out.push(result("LNK-002", "Link hosts on allowlist", offList.length || broken.length ? STATUS.FAIL : STATUS.PASS, offList.length || broken.length ? [...offList, ...broken.map((b) => `"${b.href || "(empty)"}"`)].join(", ") : `all hosts in [${linkHosts.join(", ") || "any"}]`));
  if (mismatched.length) out.push(result("LNK-005", "Link text matches destination", STATUS.WARN, mismatched.join("; ")));

  let cta = null;
  if (expect.link?.pattern) {
    const rx = toRegExp(expect.link.pattern) ?? new RegExp(escapeRegExp(expect.link.pattern));
    const matches = httpLinks.filter((l) => { rx.lastIndex = 0; return rx.test(l.href); });
    const unique = [...new Set(matches.map((l) => l.href))];
    cta = unique.length === 1 ? matches[0] : null;
    out.push(result("LNK-003", "Call-to-action link present", cta ? STATUS.PASS : STATUS.FAIL, cta ? redactUrl(cta.href) : `no link matching ${expect.link.pattern}`, { cta: cta?.href ?? null }));
    if (cta) {
      const url = parseUrl(cta.href);
      const bad = url ? [...url.searchParams].filter(([, v]) => BAD_PARAM_VALUES.has(v.trim().toLowerCase())) : [];
      const required = [].concat(expect.link.requireParams ?? []);
      const absent = url ? required.filter((p) => !url.searchParams.has(p)) : required;
      const problems = [...bad.map(([k, v]) => `${k}=${v || "(empty)"}`), ...absent.map((p) => `missing ?${p}`)];
      out.push(result("LNK-004", "Link parameters are populated", problems.length ? STATUS.FAIL : STATUS.PASS, problems.length ? problems.join(", ") : "all query parameters have values"));
    }
  }

  // One-time codes.
  if (expect.otp?.pattern) {
    const rx = toRegExp(expect.otp.pattern) ?? new RegExp(expect.otp.pattern);
    const global = new RegExp(rx.source, [...new Set(rx.flags + "g")].join(""));
    const distinct = new Set([htmlToText(message.html), message.text].flatMap((part) => [...part.matchAll(global)].map((m) => m[0])));
    const inHtml = htmlToText(message.html).match(rx)?.[0];
    const inText = message.text.match(rx)?.[0];
    const code = inHtml ?? inText;
    if (distinct.size > 1) out.push(result("OTP-001", "One-time code present", STATUS.FAIL, "multiple distinct codes; no code selected"));
    else if (!code) out.push(result("OTP-001", "One-time code present", STATUS.FAIL, `no match for ${expect.otp.pattern}`));
    else if (inHtml && inText && inHtml !== inText) out.push(result("OTP-001", "One-time code present", STATUS.FAIL, "HTML and text parts show different codes"));
    else out.push(result("OTP-001", "One-time code present", STATUS.PASS, `code ${redact(code)} (redacted)`, { otp: code }));
  }

  // Compliance for bulk/marketing mail only; transactional mail is exempt.
  if (kind === "marketing") {
    const lu = message.headers["list-unsubscribe"];
    out.push(result("CMP-001", "List-Unsubscribe header", lu ? STATUS.PASS : STATUS.FAIL, lu ? "present" : "missing: Gmail/Yahoo bulk-sender rules require one-click unsubscribe"));
  }

  // Extracted capabilities never escape a failed check set. The runner applies
  // the same gate to delivery/selection checks before following or submitting them.
  if (cta && !usableLink(parseUrl(cta.href), ctx)) {
    out.push(result("LNK-007", "CTA is an eligible owned-app URL", STATUS.FAIL, "unsupported scheme, credentials, mode, host or sensitive action"));
  }
  if (out.some((x) => x.status === STATUS.FAIL)) {
    for (const check of out) { delete check.cta; delete check.otp; }
  }

  return out;
}

const DELIVERED = new Set(["delivered"]);
const FAILED = new Set(["failed", "bounced", "rejected", "dropped", "complained", "undeliverable", "error"]);

/** True once Mermail's provider receipt for an outbound message is final. */
export function isDeliveryTerminal(record) {
  const status = String(record?.delivery_status ?? record?.provider_metadata?.delivery?.status ?? "").toLowerCase();
  return Boolean(record?.provider_metadata?.terminal) || DELIVERED.has(status) || FAILED.has(status);
}

/** DLV-004 for sender-side capture: what Mermail's provider reported for this exact message. */
export function deliveryReceiptCheck(record) {
  const top = String(record?.delivery_status ?? "").toLowerCase();
  const nested = String(record?.provider_metadata?.delivery?.status ?? "").toLowerCase();
  if (top && nested && top !== nested) return result("DLV-004", "Provider delivered the email", STATUS.FAIL, "conflicting provider delivery evidence; no capability consumed");
  const status = String(record?.delivery_status ?? record?.provider_metadata?.delivery?.status ?? "unknown").toLowerCase();
  const delivery = record?.provider_metadata?.delivery ?? {};
  const via = [delivery.provider, Number.isFinite(delivery.deliveryTimeMs) ? `${delivery.deliveryTimeMs} ms after dispatch` : null].filter(Boolean).join(", ");
  const title = "Provider delivered the email";
  if (DELIVERED.has(status)) return result("DLV-004", title, STATUS.PASS, `delivery_status=delivered${via ? ` (${via})` : ""}`);
  if (FAILED.has(status)) return result("DLV-004", title, STATUS.FAIL, `delivery_status=${status}: the recipient server refused it${via ? ` (${via})` : ""}`);
  return result("DLV-004", title, STATUS.FAIL, "no proven final delivered receipt before the deadline");
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Subset match for post-state assertions: every key in `expected` must equal the value in `actual`. */
export function jsonSubsetMatches(actual, expected) {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected) || (toRegExp(expected)?.test(String(actual)) ?? false);
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(expected).every(([k, v]) => jsonSubsetMatches(actual[k], v));
}

export function summarize(results) {
  const counts = { pass: 0, warn: 0, fail: 0, info: 0, skip: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { ...counts, status: counts.fail ? STATUS.FAIL : counts.warn ? STATUS.WARN : STATUS.PASS };
}
