#!/usr/bin/env node
// Deterministic split-desk calculator. No network, no secrets, no writes.
// Usage: node settle.mjs < ledger.json
// Input:  { "currency": "USD", "owner": "Oliver", "members": ["Oliver", "Alice", "Bob"],
//           "lines": [{ "id": "EMAIL_ID", "payer": "Alice", "amount": "12.00", "split": ["Alice", "Bob"] }] }
// Only lines the owner approved as `included` belong in the input. `split` defaults to all members.
import process from "node:process";

const toCents = (value) => {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`invalid amount ${text}`);
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
};
const fmt = (cents) => `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

const input = JSON.parse(await new Promise((resolve) => {
  let data = "";
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => resolve(data));
}));
const members = [...input.members];
const memberSet = new Set(members);
const paid = Object.fromEntries(members.map((m) => [m, 0]));
const share = Object.fromEntries(members.map((m) => [m, 0]));

for (const line of input.lines) {
  if (!memberSet.has(line.payer)) throw new Error(`line ${line.id}: payer ${line.payer} is not on the roster`);
  const split = (line.split?.length ? line.split : members).slice().sort((a, b) => members.indexOf(a) - members.indexOf(b));
  for (const m of split) if (!memberSet.has(m)) throw new Error(`line ${line.id}: ${m} is not on the roster`);
  const cents = toCents(line.amount);
  paid[line.payer] += cents;
  const base = Math.floor(cents / split.length);
  let remainder = cents - base * split.length;
  // Leftover cents go to split members in roster order, one cent each.
  for (const m of split) {
    share[m] += base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
}

const balances = members.map((m) => ({ member: m, paid: paid[m], share: share[m], balance: paid[m] - share[m] }));
const total = balances.reduce((sum, b) => sum + b.balance, 0);
if (total !== 0) throw new Error(`balances do not sum to zero (${fmt(total)})`);

// Greedy: the largest debtor pays the largest creditor; ties break by roster order.
const order = (a, b) => b.amount - a.amount || members.indexOf(a.member) - members.indexOf(b.member);
const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ member: b.member, amount: -b.balance }));
const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ member: b.member, amount: b.balance }));
const transfers = [];
while (debtors.length && creditors.length) {
  debtors.sort(order);
  creditors.sort(order);
  const d = debtors[0];
  const c = creditors[0];
  const amount = Math.min(d.amount, c.amount);
  const label = d.member === input.owner ? "owner_pays" : c.member === input.owner ? "owner_receives" : "between_members";
  transfers.push({ from: d.member, to: c.member, amount: fmt(amount), label });
  d.amount -= amount;
  c.amount -= amount;
  if (d.amount === 0) debtors.shift();
  if (c.amount === 0) creditors.shift();
}

console.log(JSON.stringify({
  currency: input.currency,
  balances: balances.map((b) => ({ member: b.member, paid: fmt(b.paid), share: fmt(b.share), balance: fmt(b.balance) })),
  transfers,
}, null, 2));
