import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DcaError, canonical } from "./core.mjs";

const STALE_LOCK_MS = 5 * 60_000;

export const resolveHome = (flag) => path.resolve(typeof flag === "string" ? flag : process.env.MERMAIL_DCA_HOME ?? ".mermail-dca");

export async function findDesk(home, prefix) {
  if (!/^[0-9a-f]{8,64}$/.test(String(prefix ?? ""))) throw new DcaError("id_malformed", String(prefix));
  let names = [];
  try {
    names = await readdir(home);
  } catch {
    // no desks yet
  }
  const matches = names.filter((name) => name.startsWith(prefix));
  if (matches.length !== 1) throw new DcaError(matches.length ? "id_ambiguous" : "id_unknown", prefix);
  return path.join(home, matches[0]);
}

export async function readDesk(dir) {
  const mandate = JSON.parse(await readFile(path.join(dir, "mandate.json"), "utf8"));
  const text = await readFile(path.join(dir, "ledger.jsonl"), "utf8");
  const ledger = text.split("\n").filter(Boolean).map((row) => JSON.parse(row));
  let state = { mailedThroughSeq: -1 };
  try {
    state = JSON.parse(await readFile(path.join(dir, "state.json"), "utf8"));
  } catch {
    // nothing mailed yet
  }
  return { dir, mandate, ledger, state };
}

async function writeAtomic(file, text) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, file);
}

export async function createDesk(dir, mandate, ledger, state) {
  await mkdir(dir, { recursive: true });
  await writeAtomic(path.join(dir, "mandate.json"), `${JSON.stringify(mandate, null, 2)}\n`);
  await writeLedger(dir, ledger);
  await writeState(dir, state);
}

export const writeLedger = (dir, ledger) => writeAtomic(path.join(dir, "ledger.jsonl"), `${ledger.map((entry) => canonical(entry)).join("\n")}\n`);
export const writeState = (dir, state) => writeAtomic(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);

// One tick at a time per desk. A lock older than five minutes is treated as a crashed tick.
export async function withLock(dir, fn) {
  const lock = path.join(dir, "tick.lock");
  let handle;
  try {
    handle = await open(lock, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const age = Date.now() - (await stat(lock)).mtimeMs;
    if (age < STALE_LOCK_MS) throw new DcaError("desk_locked", lock);
    await rm(lock, { force: true });
    handle = await open(lock, "wx");
  }
  await handle.writeFile(String(process.pid));
  await handle.close();
  try {
    return await fn();
  } finally {
    await rm(lock, { force: true });
  }
}
