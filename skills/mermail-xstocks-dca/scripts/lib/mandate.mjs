import { DcaError, canonical, isDuration, isInstant, parseInstant, sha256Hex, toBaseUnits } from "./core.mjs";

export const MANDATE_SCHEMA = "mermail-xstocks-dca/mandate@1";
export const USDC_DECIMALS = 6;
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const TOP_LEVEL = [
  "schema", "owner", "mailbox", "wallet", "legs", "cadence", "caps", "guards", "reports", "validFrom", "expiresAt",
];

export const mandateId = (mandate) => sha256Hex(canonical(mandate));
export const shortId = (id) => id.slice(0, 8);
export const usdcUnits = (value) => toBaseUnits(value, USDC_DECIMALS);

const units = (value) => {
  try {
    return usdcUnits(value);
  } catch {
    return null;
  }
};

export function validateMandate(mandate) {
  if (!mandate || typeof mandate !== "object" || Array.isArray(mandate)) return ["mandate_not_object"];
  const errors = [];
  const fail = (code) => errors.push(code);
  for (const key of Object.keys(mandate)) if (!TOP_LEVEL.includes(key)) fail(`unknown_field:${key}`);
  const { owner, mailbox, wallet, cadence, caps, guards, reports } = mandate;
  if (mandate.schema !== MANDATE_SCHEMA) fail("schema");
  if (!EMAIL.test(owner?.email ?? "")) fail("owner_email");
  if (!mailbox?.publicId || !EMAIL.test(mailbox?.email ?? "")) fail("mailbox");
  if (!wallet?.credentialId || !BASE58.test(wallet?.address ?? "") || wallet?.network !== "solana") fail("wallet");

  const perSlice = units(caps?.perSliceUsdc);
  const windowMax = units(caps?.window?.maxUsdc);
  const total = units(caps?.totalUsdc);
  if (!(perSlice > 0n)) fail("cap_per_slice");
  if (!(windowMax > 0n)) fail("cap_window");
  if (!(total > 0n)) fail("cap_total");
  if (windowMax !== null && total !== null && windowMax > total) fail("window_over_total");
  if (!isDuration(caps?.window?.duration)) fail("window_duration");

  const legs = Array.isArray(mandate.legs) ? mandate.legs : [];
  if (legs.length < 1 || legs.length > 5) fail("legs_count");
  const mints = new Set();
  let tickSum = 0n;
  legs.forEach((leg, index) => {
    if (!leg?.symbol || !leg?.productId) fail(`leg_identity:${index}`);
    if (!BASE58.test(leg?.mint ?? "") || leg.mint === USDC_MINT) fail(`leg_mint:${index}`);
    else if (mints.has(leg.mint)) fail("duplicate_mint");
    else mints.add(leg.mint);
    const slice = units(leg?.sliceUsdc);
    if (!(slice > 0n)) {
      fail(`leg_slice:${index}`);
      return;
    }
    tickSum += slice;
    if (perSlice !== null && slice > perSlice) fail(`slice_over_cap:${index}`);
  });
  if (windowMax !== null && tickSum > windowMax) fail("tick_over_window");

  if (!isDuration(cadence?.every)) fail("cadence");
  if (!isInstant(cadence?.anchor)) fail("anchor");
  if (!isDuration(reports?.statementEvery)) fail("statement_every");
  const bps = guards?.maxSlippageBps;
  if (!Number.isInteger(bps) || bps < 1 || bps > 1000) fail("slippage");
  if (!isInstant(mandate.validFrom) || !isInstant(mandate.expiresAt)
    || parseInstant(mandate.validFrom) >= parseInstant(mandate.expiresAt)) fail("validity");
  return errors;
}

export function assertMandate(mandate) {
  const errors = validateMandate(mandate);
  if (errors.length) throw new DcaError("mandate_invalid", errors.join(","));
  return mandateId(mandate);
}
