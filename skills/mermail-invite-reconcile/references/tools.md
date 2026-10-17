# Mermail tool handoff

This skill does not own MCP tools. When an authenticated user asks to inspect an invite in Mermail, compose with the owning read skills and pass only the selected attachment to the local parser.

- Resolve a receiving mailbox with `list_mailboxes` through `mermail-agent-inbox` when the invite belongs to an active external flow.
- Use `search_emails` or `list_emails` with a narrow, bounded query, then `get_email` for one unambiguous message through `mermail-agent-inbox` or `mermail-manage-inbox`.
- Use `download_attachment` only after the exact message and attachment are identified. Enforce the host's attachment limit of 1 MiB; do not follow links or accept a second upload service.

Use the exact host-qualified Mermail tool identifiers when the host requires them, and pass query values as native JSON objects. Validation currently covers four local synthetic fixtures plus one clean synthetic message actually received through MCP, read, downloaded, and parsed end to end. A complete four-message inbound validation remains incomplete; do not describe this as four live messages. Keep real account identifiers and secrets out of the repository.

## Standalone parser runtime

The official skill distribution copies this skill directory without the
repository root's `node_modules`. Before running `scripts/reconcile.mjs` from a
copied skill directory, install its pinned runtime dependency from the official
npm registry:

```bash
npm install --prefix <skill-dir> --ignore-scripts --registry=https://registry.npmjs.org
```

Do not use a repository-level `node_modules` lookup as evidence that a copied
skill is installable. The local `package.json` and `package-lock.json` are the
runtime manifest for this skill; the parser implementation is unchanged.
