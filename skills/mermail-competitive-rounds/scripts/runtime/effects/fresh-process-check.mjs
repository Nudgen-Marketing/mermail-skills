import { readBundle, verifyBundle } from "./ledger.mjs";

const root = process.argv[2];
const sourcingId = process.argv[3];
if (!root || !sourcingId) throw new Error("usage: node r8-fresh-process-check.mjs <root> <sourcing-id>");
const verification = await verifyBundle(root, { sourcing_id: sourcingId });
const bundle = verification.valid ? await readBundle(root, { sourcing_id: sourcingId }) : null;
console.log(JSON.stringify({ verification, state: bundle?.state ?? null }, null, 2));
