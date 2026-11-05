// Offline projection only. Inputs must already be independently verified by the
// integration. This module does not authenticate email, reserve state or send.
const TOKEN = /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/;
const address = value => {
  if (typeof value !== 'string' || !/^[^\s@<>]+@[^\s@<>]+$/.test(value)) return null;
  const [local, domain] = value.split('@');
  return `${local}@${domain.toLowerCase()}`;
};
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
};

export function projectReview(gate, messages, now) {
  const result = state => ({ state, authorizesEffect: false });
  const clock = instant(now), sent = instant(gate?.sentAt), expiry = instant(gate?.expiresAt);
  if (!gate || !Array.isArray(messages) || messages.length > 20 ||
      !address(gate.approver) || !address(gate.recipient) || !TOKEN.test(gate.token ?? '') ||
      !gate.workspaceId || !gate.mailboxId || !gate.threadId || !gate.requestId ||
      !gate.previewHash || gate.previewHash !== gate.currentPreviewHash ||
      ![clock, sent, expiry].every(Number.isFinite) || expiry <= sent || clock < sent)
    return result('blocked');
  if (['reserved', 'consumed', 'uncertain', 'rejected'].includes(gate.intentState)) return result('blocked');
  if (gate.intentState !== 'pending' || gate.coverageComplete !== true) return result('blocked');
  if (clock > expiry) return result('expired');
  const seen = new Map(), decisions = [];
  for (const message of messages) {
    if (!message || typeof message.id !== 'string' || !message.id) return result('blocked');
    // Objects are metadata observations, not body storage; preserve every
    // supplied field in duplicate comparisons to avoid hiding changed verdicts.
    const fingerprint = JSON.stringify(Object.entries(message).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(message.id)) {
      if (seen.get(message.id) !== fingerprint) return result('blocked');
      continue;
    }
    seen.set(message.id, fingerprint);
    if (message.workspaceId !== gate.workspaceId || message.mailboxId !== gate.mailboxId ||
        message.threadId !== gate.threadId || message.replyToId !== gate.requestId ||
        address(message.from) !== address(gate.approver) || address(message.to) !== address(gate.recipient)) continue;
    if (message.scan !== 'clean' || message.authentication !== 'pass' || message.authoredSeparated !== true)
      return result('blocked');
    const received = instant(message.receivedAt);
    if (!Number.isFinite(received)) return result('blocked');
    if (received <= sent || received > expiry || received > clock) continue;
    if (typeof message.authoredText !== 'string' || message.authoredText.length > 10000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(message.authoredText))
      return result('blocked');
    const lines = message.authoredText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const match = /^(APPROVE|DECLINE|REJECT) ([A-Z2-7]{4}(?:-[A-Z2-7]{4}){3})$/.exec(lines[0] ?? '');
    if (!match || match[2] !== gate.token) continue;
    if (match[1] === 'REJECT' && gate.allowRejectAlias !== true) continue;
    if (lines.slice(1).some(line => /^(APPROVE|DECLINE|REJECT) /.test(line))) return result('ambiguous');
    decisions.push(match[1] === 'APPROVE' ? 'review_approved' : 'rejected');
  }
  if (decisions.length > 1) return result('ambiguous');
  return result(decisions[0] ?? 'pending');
}
