import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateLanePacket } from "./lane-packet.mjs";

const BASE_ENV_KEYS = Object.freeze([
  "Path",
  "PATH",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "TEMP",
  "TMP",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "NUMBER_OF_PROCESSORS",
]);

const SENSITIVE_ENV_RE = /(?:MCP|MERMAIL|OAUTH|TOKEN|SECRET|PASSWORD|API[_-]?KEY|GITHUB|AWS|AZURE|GOOGLE|CODEX_HOME|OPENAI_API_KEY)/iu;

export class R5RunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "R5RunnerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new R5RunnerError(code, message, details);
}

function safeLaneName(laneId) {
  return String(laneId).replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 64) || "lane";
}

function safeEnvValue(parentEnv, key) {
  if (typeof parentEnv[key] === "string" && parentEnv[key].length > 0) return parentEnv[key];
  const lower = key.toLowerCase();
  const alternate = Object.keys(parentEnv).find((candidate) => candidate.toLowerCase() === lower);
  return alternate ? parentEnv[alternate] : undefined;
}

export function buildWorkerEnvironment(parentEnv = process.env, extra = {}) {
  const environment = {};
  for (const key of BASE_ENV_KEYS) {
    const value = safeEnvValue(parentEnv, key);
    if (value !== undefined) environment[key] = value;
  }
  if (!environment.Path && !environment.PATH) environment.Path = process.env.Path ?? process.env.PATH ?? "";
  if (!environment.TEMP) environment.TEMP = tmpdir();
  if (!environment.TMP) environment.TMP = environment.TEMP;
  Object.assign(environment, {
    R5_WORKER_NO_MCP: "1",
    R5_WORKER_INPUT_CHANNEL: "stdin_single_packet",
    ...extra,
  });
  return Object.freeze(environment);
}

export function sensitiveEnvironmentNames(environment) {
  return Object.keys(environment).filter((key) => SENSITIVE_ENV_RE.test(key) && !key.startsWith("R5_WORKER_")).sort();
}

export function createWorkerTempDirectory(laneId) {
  return mkdtempSync(join(tmpdir(), `r5-${safeLaneName(laneId)}-`));
}

export function runOneShotWorker({ packet, worker_script, worker_args = [], parent_env = process.env, timeout_ms = 30_000, external_probe_path = null }) {
  validateLanePacket(packet);
  const script = resolve(worker_script);
  const tempDirectory = createWorkerTempDirectory(packet.lane_id);
  const environment = buildWorkerEnvironment(parent_env, {
    R5_WORKER_LANE_ID: packet.lane_id,
    R5_WORKER_PACKET_DIGEST: packet.packet_digest,
  });
  const args = [...worker_args];
  if (external_probe_path !== null) args.push("--external-probe", resolve(external_probe_path));
  let result;
  try {
    result = spawnSync(process.execPath, [script, ...args], {
      cwd: tempDirectory,
      env: environment,
      input: JSON.stringify(packet),
      encoding: "utf8",
      timeout: timeout_ms,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
  } finally {
    // This is lifecycle cleanup, not a secure-deletion claim.
    rmSync(tempDirectory, { recursive: true, force: true });
  }
  if (!result) fail("NO_PROCESS_RESULT", "worker process returned no result");
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal !== null && result.status === null;
  return Object.freeze({
    packet_digest: packet.packet_digest,
    worker_script: script,
    exit_code: result.status,
    signal: result.signal,
    timed_out: timedOut,
    process_error_code: result.error?.code ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    working_directory_removed: !existsSync(tempDirectory),
    environment_names: Object.keys(environment).sort(),
    sensitive_environment_names: sensitiveEnvironmentNames(environment),
  });
}

export function inspectWorkerTempDirectory(directory) {
  return Object.freeze({
    exists: existsSync(directory),
    entries: existsSync(directory) ? readdirSync(directory).sort() : [],
  });
}

export { BASE_ENV_KEYS, SENSITIVE_ENV_RE };
