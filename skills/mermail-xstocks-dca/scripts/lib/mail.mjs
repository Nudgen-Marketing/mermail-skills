// Helpers for Mermail message objects as returned by list_emails, search_emails and get_email
// (sender, date, folder_id, body + body_format), also accepting from/receivedAt/folder/text/html.

// Strict on purpose: a header we cannot read unambiguously (several addresses, stray brackets)
// belongs to nobody, so it can never match the owner or the desk. A quoted display name is read
// the way a mail client reads it: the address is the one in the trailing angle brackets.
const BARE_ADDRESS = /^[^\s<>",;]+@[^\s<>",;]+$/;
const NAMED_ADDRESS = /^(?:"[^"]*"|[^<>,;"]*)\s*<([^\s<>",;]+@[^\s<>",;]+)>$/;

export function addressOf(from) {
  const text = String(from ?? "").trim();
  if (BARE_ADDRESS.test(text)) return text.toLowerCase();
  const named = NAMED_ADDRESS.exec(text);
  return named ? named[1].toLowerCase() : "";
}

export const senderOf = (email) => email?.from ?? email?.sender;
export const receivedAtOf = (email) => email?.receivedAt ?? email?.date;
export const folderOf = (email) => email?.folder ?? email?.folder_id;

export function htmlToText(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Quoted history in HTML replies (Gmail and most clients) is not the sender's new words.
const QUOTED_HTML = [/<blockquote[\s\S]*?<\/blockquote>/gi, /<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i];

export function bodyTextOf(email, { dropQuotes = false, limit = Infinity } = {}) {
  if (typeof email?.text === "string") return email.text.slice(0, limit);
  const html = typeof email?.html === "string" ? email.html : email?.body_format === "html" ? email?.body : undefined;
  if (typeof html === "string") {
    const kept = dropQuotes ? QUOTED_HTML.reduce((text, pattern) => text.replace(pattern, ""), html) : html;
    return htmlToText(kept).slice(0, limit);
  }
  return String(email?.body ?? "").slice(0, limit);
}
