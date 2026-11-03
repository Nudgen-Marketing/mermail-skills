# E-invoice intake tools

This workflow **uses** tools owned by other official skills. Do not add them to this skill in `tool-coverage.json`.

Pass structured arguments as **native JSON objects**. Never stringify `query` or `body`. Use the exact host identifier (`list_emails` or `Mermail:list_emails`). Prefer mailbox `public_id` as `mailboxId`.

## Intent map

| Intent | Real operation | Owner | Risk |
| --- | --- | --- | --- |
| Find the AP mailbox | `list_mailboxes` | `mermail-administer-workspace` | read |
| Ensure filing folders | `list_folders`, `create_folder` | `mermail-manage-inbox` | read / internal write |
| Find invoice mail | `list_emails` (metadata only) | `mermail-manage-inbox` | read |
| Inspect one message | `get_email` (metadata only) | `mermail-manage-inbox` | read |
| Fetch the XML | `download_attachment` | `mermail-manage-inbox` | read |
| File the result | `move_email` | `mermail-manage-inbox` | internal write |
| Ask supplier for a fix | `save_draft` (`body.body` string) | `mermail-compose-email` | internal write |
| Send a draft (separate, approved) | `send_email` via `mermail-compose-email` | `mermail-compose-email` | external effect |

The pre-check itself is local: `node scripts/check-invoice.mjs < invoice.xml`. It needs no network and no key.

## Examples

### `list_mailboxes`

```json
{}
```

### `list_folders`

```json
{ "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }
```

### `create_folder`

Creation derives the folder id by slugifying the name: `E-invoices review` becomes `e-invoices-review`.

```json
{ "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "body": { "name": "E-invoices review" } }
```

### `list_emails`

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "query": {
    "folder": "inbox",
    "page": 1,
    "limit": 25,
    "sortColumn": "date",
    "sortDirection": "DESC",
    "metadata_only": true,
    "agent_safe_content": true
  }
}
```

If the live `search_emails` schema exposes an attachment-presence filter, it may narrow this list. Use only the field name the live schema shows.

### `get_email`

Use this selected metadata-only read to obtain attachment ids, types and names after the safe list projection. Omit `agent_safe_content` here because that projection removes `attachments`; keep `metadata_only` and the clean-scan requirement. A scan mismatch returns protected metadata, not permission to bypass the gate. Treat missing attachment metadata as uncertain rather than as an empty list.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_valid",
  "query": { "metadata_only": true, "require_scan_status": "clean" }
}
```

### `download_attachment`

Use ids from the selected message's own metadata. Binary responses over 1 MiB are rejected by the MCP bridge; report that limit instead of finding another route.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_valid",
  "attachmentId": "att_1"
}
```

### `move_email`

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "emailId": "msg_valid",
  "body": { "folderId": "e-invoices-review" }
}
```

### `save_draft`

Draft content is the string `body.body`. Do not use `html` or `text` for drafts. Recipient is the authenticated `From` address only.

Follow the source-bound write/reconciliation rules in [workflows.md](workflows.md). When exposed by the live schema, a stable top-level `idempotencyKey` is reused only for the identical method/path/query/body and exact source intent. An uncertain write or key conflict requires state reconciliation, not a retry with a fresh key. Retain the returned draft id with the exact source email id; supplier or thread similarity is not enough to prove a prior draft matches.

```json
{
  "mailboxId": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "body": {
    "to": "billing@supplier-b.example",
    "subject": "E-invoice not accepted: corrections needed",
    "body": "Hello,\n\nThe e-invoice you sent could not be accepted by our limited automated pre-check. It found these issues (LOCAL-AMOUNT, when present, is a local prerequisite check):\n\n- BR-CO-15 (BT-112): Invoice total amount with VAT (BT-112) shall equal Invoice total amount without VAT (BT-109) plus Invoice total VAT amount (BT-110).\n\nPlease send a corrected invoice.\n\nAccounts Payable"
  }
}
```

## Checker output

```json
{
  "checker": "check-invoice.mjs/2",
  "scope": "Pre-check of the EN 16931 rules listed in checkedRules on UBL 2.1 Invoice only. ...",
  "checkedRules": ["BR-01", "BR-02", "BR-03", "BR-04", "BR-05", "BR-06", "BR-07", "BR-13", "BR-14", "BR-16", "BR-CO-15"],
  "skippedRules": [],
  "syntax": "UBL-2.1-Invoice",
  "verdict": "fail",
  "findings": [{ "rule": "BR-CO-15", "bt": "BT-112", "message": "Invoice total amount with VAT ..." }]
}
```

`verdict` is one of `pass`, `fail`, `unsupported` (CII or a non-invoice root) and `refused` (not XML, not UTF-8, over 1 MiB, malformed, containing a DTD, or an `Invoice` root without the UBL 2.1 namespace).

`supportedRules` is the capability list, not evidence that a rule ran. On malformed or unsupported XML, `checkedRules` is empty. On missing/invalid/ambiguous amount prerequisites, verdict is `fail`, findings include the local code `LOCAL-AMOUNT`, BR-CO-15 is absent from `checkedRules` and appears in `skippedRules`. Amounts support exact signed XML decimal lexical forms up to two fractional digits; exponents, non-decimal text, excess precision, wrong/missing currencyID and values longer than 128 characters fail locally. Namespace URI binding is required for the Invoice root and every CBC/CAC field; prefix aliases are supported. No official schematron, tax code list, full XML Schema or national CIUS validation is implied.
