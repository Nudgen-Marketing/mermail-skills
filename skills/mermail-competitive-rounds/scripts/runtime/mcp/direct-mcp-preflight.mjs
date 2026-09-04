import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  SdkHttpError,
  resourceUrlFromServerUrl,
} from "@modelcontextprotocol/client";

const MCP_URL = new URL("https://console.mermail.app/mcp");
const PRIVATE_DIR = process.env.MERMAIL_COMPETITIVE_OAUTH_DIR || join(tmpdir(), "mermail-competitive-rounds-oauth");
const OAUTH_STATE_PATH = join(PRIVATE_DIR, "oauth-state.json");
const PREFLIGHT_PATH = process.env.MERMAIL_COMPETITIVE_PREFLIGHT_PATH || join(tmpdir(), "mermail-competitive-rounds-preflight.json");
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = Number(process.env.MERMAIL_COMPETITIVE_CALLBACK_PORT || "57313");

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
}

function redact(value, key = "") {
  if (/(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization[_-]?code|code[_-]?verifier|bearer)/iu.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  }
  return value;
}

function errorSummary(error) {
  const summary = { name: error?.name || "Error" };
  if (typeof error?.code === "string") summary.code = error.code;
  if (typeof error?.status === "number") summary.http_status = error.status;
  if (typeof error?.statusText === "string") summary.http_status_text = error.statusText;
  if (error instanceof SdkHttpError && error.data && typeof error.data.status === "number") summary.http_status = error.data.status;
  return summary;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(redact(value), null, 2)}\n`, { encoding: "utf8" });
}

function loadState() {
  if (!existsSync(OAUTH_STATE_PATH)) return { clients: {}, tokens: {}, verifier: null, discovery: null, last_state: null };
  try {
    const parsed = JSON.parse(readFileSync(OAUTH_STATE_PATH, "utf8"));
    return {
      clients: parsed.clients && typeof parsed.clients === "object" ? parsed.clients : {},
      tokens: parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {},
      verifier: typeof parsed.verifier === "string" ? parsed.verifier : null,
      discovery: parsed.discovery && typeof parsed.discovery === "object" ? parsed.discovery : null,
      last_state: typeof parsed.last_state === "string" ? parsed.last_state : null,
    };
  } catch {
    throw new Error("Mermail competitive-rounds OAuth state exists but is not valid JSON");
  }
}

class FileOAuthProvider {
  constructor({ redirectUrl }) {
    this.redirectUrl = redirectUrl;
    this.clientMetadata = {
      client_name: "Mermail competitive-rounds direct adapter",
      redirect_uris: [redirectUrl],
      application_type: "native",
    };
    this.stateData = loadState();
    this.lastState = this.stateData.last_state;
  }

  async persist() {
    await mkdir(PRIVATE_DIR, { recursive: true });
    await writeFile(OAUTH_STATE_PATH, `${JSON.stringify(this.stateData, null, 2)}\n`, { encoding: "utf8" });
  }

  state() {
    this.lastState = randomUUID();
    this.stateData.last_state = this.lastState;
    return this.lastState;
  }

  clientInformation(ctx) {
    if (!ctx?.issuer) return undefined;
    return this.stateData.clients[ctx.issuer];
  }

  async saveClientInformation(info, ctx) {
    if (!ctx?.issuer) throw new Error("OAuth client registration did not provide an issuer");
    this.stateData.clients[ctx.issuer] = info;
    await this.persist();
  }

  tokens(ctx) {
    if (ctx?.issuer) return this.stateData.tokens[ctx.issuer];
    const issuers = Object.keys(this.stateData.tokens);
    return issuers.length ? this.stateData.tokens[issuers[issuers.length - 1]] : undefined;
  }

  async saveTokens(tokens, ctx) {
    if (ctx?.issuer) this.stateData.tokens[ctx.issuer] = tokens;
    else this.stateData.tokens.__most_recent__ = tokens;
    await this.persist();
  }

  redirectToAuthorization(url) {
    this.lastAuthorizationUrl = String(url);
  }

  async saveCodeVerifier(verifier) {
    this.stateData.verifier = verifier;
    await this.persist();
  }

  codeVerifier() {
    if (!this.stateData.verifier) throw new Error("OAuth code verifier is unavailable");
    return this.stateData.verifier;
  }

  async saveDiscoveryState(discovery) {
    this.stateData.discovery = discovery;
    await this.persist();
  }

  discoveryState() {
    return this.stateData.discovery || undefined;
  }

  async invalidateCredentials(scope) {
    if (scope === "all" || scope === "tokens") this.stateData.tokens = {};
    if (scope === "all" || scope === "client") this.stateData.clients = {};
    if (scope === "all" || scope === "verifier") this.stateData.verifier = null;
    if (scope === "all" || scope === "discovery") this.stateData.discovery = null;
    await this.persist();
  }

  async validateResourceURL(serverUrl, resource) {
    const expected = resourceUrlFromServerUrl(serverUrl);
    if (resource && String(resource) !== expected.href) throw new Error("MCP resource URL did not match the configured server");
    return expected;
  }

  hasStoredToken() {
    return Object.keys(this.stateData.tokens).some((issuer) => issuer !== "__most_recent__");
  }
}

function callbackResponse(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(body);
}

async function listenForCallback(provider) {
  let finish;
  let fail;
  const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  let activeTransport;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${CALLBACK_HOST}`);
      if (url.pathname !== "/callback") {
        callbackResponse(response, 404, "Not found");
        return;
      }
      if (url.searchParams.get("state") !== provider.lastState) {
        callbackResponse(response, 400, "Authorization state mismatch");
        return;
      }
      if (!activeTransport) {
        callbackResponse(response, 503, "Authorization is not ready");
        return;
      }
      await activeTransport.finishAuth(url.searchParams);
      callbackResponse(response, 200, "Authorization received. You may close this tab.");
      finish();
    } catch {
      callbackResponse(response, 400, "Authorization could not be completed.");
      fail(new Error("OAuth callback exchange failed"));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(CALLBACK_PORT, CALLBACK_HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("OAuth callback listener did not expose a port");
  const callbackUrl = `http://${CALLBACK_HOST}:${address.port}/callback`;
  provider.redirectUrl = callbackUrl;
  provider.clientMetadata.redirect_uris = [callbackUrl];
  return {
    server,
    callbackUrl,
    completed,
    setTransport(transport) { activeTransport = transport; },
  };
}

function newClient(provider) {
  const client = new Client({ name: "mermail-competitive-rounds", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    authProvider: provider,
    onInsufficientScope: "throw",
  });
  return { client, transport };
}

async function connectAuthenticated() {
  const callback = await listenForCallbackPlaceholder();
  const provider = callback.provider;
  const hadStoredToken = provider.hasStoredToken();
  const first = newClient(provider);
  callback.setTransport(first.transport);
  try {
    await first.client.connect(first.transport);
    await callback.close();
    return { ...first, provider, oauth_interaction: false, callback_url: callback.callbackUrl, hadStoredToken };
  } catch (error) {
    if (!(error instanceof UnauthorizedError) && !provider.lastAuthorizationUrl) {
      await callback.close();
      throw error;
    }
    if (!provider.lastAuthorizationUrl) {
      await callback.close();
      throw error;
    }
    console.log(JSON.stringify({
      type: "MERMAIL_COMPETITIVE_OAUTH_ACTION_REQUIRED",
      authorization_url: provider.lastAuthorizationUrl,
      callback: callback.callbackUrl,
      instruction: "Open the authorization URL, complete Mermail authorization, then return to this process.",
      mermail_writes: 0,
    }, null, 2));
    await callback.completed;
    await first.client.close().catch(() => {});
    const second = newClient(provider);
    await second.client.connect(second.transport);
    await callback.close();
    return { ...second, provider, oauth_interaction: true, callback_url: callback.callbackUrl, hadStoredToken };
  }
}

async function listenForCallbackPlaceholder() {
  const provider = new FileOAuthProvider({ redirectUrl: `http://${CALLBACK_HOST}:${CALLBACK_PORT}/callback` });
  const callback = await listenForCallback(provider);
  callback.provider = provider;
  const originalClose = callback.server.close.bind(callback.server);
  callback.close = () => new Promise((resolve) => {
    if (!callback.server.listening) resolve();
    else originalClose(() => resolve());
  });
  return callback;
}

function summarizeTool(tool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
  };
}

async function runPreflight() {
  const startedAt = new Date().toISOString();
  const connection = await connectAuthenticated();
  const { client, transport, provider } = connection;
  try {
    const toolPage = await client.listTools({});
    const tools = toolPage.tools.map(summarizeTool);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const readCandidates = ["list_mailboxes", "list_workspaces"];
    const readTool = readCandidates.find((name) => byName.has(name));
    if (!readTool) throw new Error("No configured harmless mailbox/workspace read tool was advertised");
    const readResult = await client.callTool({ name: readTool, arguments: {} });
    const resultError = readResult?.isError === true;
    if (resultError) throw new Error(`${readTool} returned an MCP tool-level error`);
    const sendTool = byName.get("send_email");
    const evidence = {
      observed_at: startedAt,
      endpoint: MCP_URL.href,
      profile: "default_authenticated_direct_mcp",
      client_package: "@modelcontextprotocol/client@2.0.0",
      protocol_version: transport.protocolVersion || null,
      server_version: client.getServerVersion?.() || null,
      server_capabilities: client.getServerCapabilities?.() || null,
      session_id_present: Boolean(transport.sessionId),
      auth: {
        operational: true,
        direct_oauth_provider: true,
        stored_token_present_before_connect: connection.hadStoredToken,
        token_material_recorded: false,
      },
      tool_count: tools.length,
      tools,
      send_email: sendTool ? {
        present: true,
        schema_hash: sha256(sendTool.inputSchema),
        input_schema: sendTool.inputSchema,
        annotations: sendTool.annotations,
        description: sendTool.description,
      } : { present: false },
      harmless_read: {
        tool: readTool,
        mcp_isError: Boolean(readResult?.isError),
        structured_content_present: readResult?.structuredContent !== undefined,
        result: readResult,
      },
      writes_during_preflight: 0,
      openai_model_calls: 0,
      openai_api_calls: 0,
    };
    await writeJson(PREFLIGHT_PATH, evidence);
    console.log(JSON.stringify({
      type: "MERMAIL_COMPETITIVE_DIRECT_PREFLIGHT_PASS",
      evidence_path: PREFLIGHT_PATH,
      endpoint: MCP_URL.href,
      protocol_version: evidence.protocol_version,
      tool_count: evidence.tool_count,
      send_email_present: evidence.send_email.present,
      send_email_schema_hash: evidence.send_email.schema_hash || null,
      harmless_read: readTool,
      mermail_writes: 0,
      openai_api_calls: 0,
    }, null, 2));
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}

if (process.argv[1]?.endsWith("direct-mcp-preflight.mjs")) {
  runPreflight().catch((error) => {
    console.error(JSON.stringify({
      type: "MERMAIL_COMPETITIVE_DIRECT_PREFLIGHT_BLOCKED",
      error: errorSummary(error),
      mermail_writes: 0,
      openai_api_calls: 0,
    }, null, 2));
    process.exitCode = 1;
  });
}

export { FileOAuthProvider, connectAuthenticated, runPreflight, MCP_URL, OAUTH_STATE_PATH };
