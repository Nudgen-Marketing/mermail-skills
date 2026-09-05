import { createHash } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { connectAuthenticated, MCP_URL } from "./direct-mcp-preflight.mjs";
import { normalizeReadObservation } from "../effects/observation.mjs";

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function decode(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = result?.content?.find((item) => item?.type === "text")?.text;
  if (typeof text !== "string") return null;
  try { return JSON.parse(text); } catch { return text; }
}

function candidates(decoded) {
  if (Array.isArray(decoded)) return decoded;
  return decoded?.items ?? decoded?.emails ?? decoded?.messages ?? decoded?.data ?? [];
}

/**
 * Narrow R8-native adapter. It owns one direct MCP client session and exposes
 * only R8 preflight, exact send dispatch, and bounded read reconciliation.
 * Live dispatch is disabled by default and must be explicitly enabled by the
 * already-validated R8 gateway; no caller may use this class as a free-form
 * Mermail client.
 */
export class DirectMermailAdapter {
  constructor({ client, transport, writeEnabled = false, recipientMailboxId = null, expectedToolSchemaHash = "0be3a178435a827e56e7be1b1d5f15215ed009a2425ee5c3f86fb98601f0bad8" } = {}) {
    this.client = client;
    this.transport = transport;
    this.writeEnabled = writeEnabled;
    this.expectedToolSchemaHash = expectedToolSchemaHash;
    this.recipientMailboxId = recipientMailboxId;
    this.dispatchCount = 0;
    this.observer_type = "TRUSTED_READ_ONLY_MERMAIL_ADAPTER";
    this.authority_boundary = "DIRECT_MERMAIL_READ_ONLY_ADAPTER";
  }

  static async connect({ writeEnabled = false, recipientMailboxId = null } = {}) {
    const connection = await connectAuthenticated();
    return Object.freeze({
      adapter: new DirectMermailAdapter({ ...connection, writeEnabled, recipientMailboxId }),
      connection,
    });
  }

  async preflight({ mailboxId, mailboxEmail, recipient, communicationRef, subject, currentStateDigest = null } = {}) {
    const toolsPage = await this.client.listTools({});
    const send = toolsPage.tools.find((tool) => tool.name === "send_email");
    if (!send) return Object.freeze({ allowed: false, reason: "SEND_TOOL_MISSING" });
    const schemaHash = digest(send.inputSchema);
    if (schemaHash !== this.expectedToolSchemaHash) return Object.freeze({ allowed: false, reason: "SEND_SCHEMA_DRIFT", schema_hash: schemaHash });
    const mailboxesResult = await this.client.callTool({ name: "list_mailboxes", arguments: {} });
    if (mailboxesResult?.isError === true) return Object.freeze({ allowed: false, reason: "MAILBOX_READ_FAILED" });
    const mailboxes = candidates(decode(mailboxesResult));
    const mailbox = mailboxes.find((item) => item.public_id === mailboxId && item.email === mailboxEmail && item.can_receive === true && item.receiving_status === "ready" && item.disabled_at === null);
    if (!mailbox) return Object.freeze({ allowed: false, reason: "MAILBOX_IDENTITY_OR_READINESS" });
    const checks = [];
    for (const [side, id] of [["buyer", mailboxId], ["recipient", recipient]]) {
      const result = await this.client.callTool({ name: "search_emails", arguments: { mailboxId: id, query: { query: communicationRef, subject, limit: 100, metadata_only: true } } });
      if (result?.isError === true) return Object.freeze({ allowed: false, reason: `${side.toUpperCase()}_SEARCH_FAILED` });
      checks.push({ side, count: candidates(decode(result)).length });
    }
    if (checks.some((item) => item.count !== 0)) return Object.freeze({ allowed: false, reason: "COMMUNICATION_REFERENCE_ALREADY_OBSERVED", checks });
    return Object.freeze({ allowed: true, current_state_digest: currentStateDigest, authority: "DIRECT_MCP_OAUTH_READONLY_PREFLIGHT", checks, endpoint: MCP_URL.href, writes: 0 });
  }

  async dispatch(request) {
    if (!this.writeEnabled) throw new Error("DIRECT_MCP_WRITE_DISABLED_UNTIL_R8_APPROVAL_ARTIFACT_VALIDATION");
    if (this.dispatchCount !== 0) throw new Error("DIRECT_MCP_SINGLE_ATTEMPT_GUARD");
    if (!request || request.action !== "send_email") throw new Error("DIRECT_MCP_ONLY_APPROVED_SEND_EMAIL");
    this.dispatchCount += 1;
    const result = await this.client.callTool({ name: "send_email", arguments: request });
    return Object.freeze({ tool_result: result, direct_mcp: true, endpoint: MCP_URL.href, dispatch_count: this.dispatchCount });
  }

  async readObservations(intent, { recipientMailboxId = this.recipientMailboxId, observedAt = new Date().toISOString() } = {}) {
    if (!recipientMailboxId) throw new Error("DIRECT_MCP_RECIPIENT_MAILBOX_REQUIRED");
    const observations = [];
    for (const [observationType, mailboxId] of [["PROVIDER", intent.mailbox_id], ["RECIPIENT_MAILBOX", recipientMailboxId]]) {
      const result = await this.client.callTool({ name: "search_emails", arguments: { mailboxId, query: { query: intent.communication_ref, subject: intent.subject, limit: 100, metadata_only: false } } });
      if (result?.isError === true) throw new Error(`DIRECT_MCP_${observationType}_SEARCH_FAILED`);
      for (const candidate of candidates(decode(result))) {
        observations.push(normalizeReadObservation({
          raw: candidate,
          observation_type: observationType,
          mailbox_id: mailboxId,
          recipient_mailbox_id: observationType === "RECIPIENT_MAILBOX" ? mailboxId : null,
          communication_ref: intent.communication_ref,
          adapter_class: "DirectMermailAdapter",
          authority_boundary: this.authority_boundary,
          read_operation: "search_emails",
          observed_at: observedAt,
        }));
      }
    }
    return Object.freeze(observations);
  }

  async reconcile({ buyerMailboxId, supplierMailboxId, communicationRef, subject } = {}) {
    const intent = { mailbox_id: buyerMailboxId, communication_ref: communicationRef, subject };
    return Object.freeze({ observations: await this.readObservations(intent, { recipientMailboxId: supplierMailboxId }), read_only: true });
  }

  async close() {
    const closeResult = this.client?.close?.();
    await closeResult?.catch?.(() => {});
  }
}

export { Client, StreamableHTTPClientTransport };
