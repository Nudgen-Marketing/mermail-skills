#!/usr/bin/env node
// Offline owner-reviewed ledger calculator; no network or financial effects.
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_ACTIVE = 18;
const text = value => typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const toCents = (value) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,63})(?:\.\d{1,2})?$/.test(value)) throw new Error("amount must be a bounded nonnegative decimal string with at most two fractional digits");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const fmt = cents => {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};

// Every connected settlement component sums to zero. Minimum edges equal
// n - maximum zero-sum components. Exact subset DP counts zero-sum boundaries
// in a best ordering, in O(n * 2^n), with roster-order tie breaking.
function minimumGroups(active) {
  const n = active.length;
  if (n > MAX_ACTIVE) throw new Error(`exact minimum requires at most ${MAX_ACTIVE} nonzero balances; no unproven greedy plan was produced`);
  if (!n) return [];
  const size = 1 << n, sums = new Array(size), groups = new Uint8Array(size), last = new Uint8Array(size);
  sums[0] = 0n;
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask, index = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + active[index].balance;
    let best = -1, chosen = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) {
      const candidate = groups[mask ^ (1 << i)];
      if (candidate > best) { best = candidate; chosen = i; }
    }
    groups[mask] = best + (sums[mask] === 0n ? 1 : 0);
    last[mask] = chosen;
  }
  const result = []; let mask = size - 1, group = [];
  while (mask) {
    const i = last[mask]; group.push(active[i]); mask ^= 1 << i;
    if (sums[mask] === 0n) { result.push(group.sort((a, b) => a.order - b.order)); group = []; }
  }
  if (group.length || result.length !== groups[size - 1]) throw new Error("internal exact partition mismatch");
  return result;
}

export function settleLedger(input) {
  if (!input || typeof input !== "object" || typeof input.currency !== "string" || !/^[A-Z]{3,8}$/.test(input.currency)) throw new Error("explicit settlement currency required");
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 100 || input.members.some(m => !text(m))) throw new Error("provide 1 to 100 distinct roster names");
  const members = input.members, memberSet = new Set(members);
  if (memberSet.size !== members.length || !memberSet.has(input.owner)) throw new Error("duplicate roster member or owner missing from roster");
  if (!Array.isArray(input.lines) || input.lines.length > 100) throw new Error("provide at most 100 approved receipt lines");
  const paid = new Map(members.map(m => [m, 0n])), share = new Map(members.map(m => [m, 0n])), ids = new Set();
  for (const line of input.lines) {
    if (!line || !text(line.id) || ids.has(line.id)) throw new Error("each receipt needs a unique source line ID");
    ids.add(line.id);
    if (!memberSet.has(line.payer)) throw new Error("payer is not on the roster");
    if (line.currency !== undefined && line.currency !== input.currency) throw new Error("receipt currency differs from settlement currency");
    const split = line.split === undefined ? members : line.split;
    if (!Array.isArray(split) || !split.length || new Set(split).size !== split.length || split.some(m => !memberSet.has(m))) throw new Error("split must contain distinct roster members");
    const ordered = [...split].sort((a, b) => members.indexOf(a) - members.indexOf(b));
    const cents = toCents(line.amount), base = cents / BigInt(ordered.length);
    let remainder = cents % BigInt(ordered.length);
    paid.set(line.payer, paid.get(line.payer) + cents);
    for (const m of ordered) {
      share.set(m, share.get(m) + base + (remainder > 0n ? 1n : 0n));
      if (remainder > 0n) remainder--;
    }
  }
  const balances = members.map((member, order) => ({ member, order, paid: paid.get(member), share: share.get(member), balance: paid.get(member) - share.get(member) }));
  if (balances.reduce((sum, b) => sum + b.balance, 0n) !== 0n) throw new Error("balances do not sum to zero");
  const components = minimumGroups(balances.filter(b => b.balance !== 0n)), transfers = [];
  const order = (a, b) => a.amount === b.amount ? a.order - b.order : a.amount > b.amount ? -1 : 1;
  for (const component of components) {
    const debtors = component.filter(b => b.balance < 0n).map(b => ({ ...b, amount: -b.balance }));
    const creditors = component.filter(b => b.balance > 0n).map(b => ({ ...b, amount: b.balance }));
    while (debtors.length && creditors.length) {
      debtors.sort(order); creditors.sort(order);
      const debtor = debtors[0], creditor = creditors[0], amount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;
      transfers.push({ from: debtor.member, to: creditor.member, amount: fmt(amount), label: debtor.member === input.owner ? "owner_pays" : creditor.member === input.owner ? "owner_receives" : "between_members" });
      debtor.amount -= amount; creditor.amount -= amount;
      if (!debtor.amount) debtors.shift(); if (!creditor.amount) creditors.shift();
    }
    if (debtors.length || creditors.length) throw new Error("internal unsettled component");
  }
  const active = balances.filter(b => b.balance !== 0n).length;
  if (transfers.length !== active - components.length) throw new Error("internal nonminimal plan");
  return { currency: input.currency, balances: balances.map(b => ({ member: b.member, paid: fmt(b.paid), share: fmt(b.share), balance: fmt(b.balance) })), transfers, optimization: { exact: true, transferCount: transfers.length, nonzeroBalances: active, maxNonzeroBalances: MAX_ACTIVE } };
}

export async function main() {
  try {
    const chunks = []; let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 1024 * 1024) throw new Error("ledger input exceeds 1 MiB");
      chunks.push(chunk);
    }
    console.log(JSON.stringify(settleLedger(JSON.parse(Buffer.concat(chunks).toString("utf8"))), null, 2));
    return 0;
  } catch (error) { console.error(error.message); return 1; }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exitCode = await main();
