# Wallet Sentinel — MCP Tool Reference

## Wallet (PayBox) — Read Only

| Tool | Purpose | When to use |
|------|---------|-------------|
| `get_paybox_connection` | Establish wallet session | Always call first before any wallet read |
| PayBox balance reads | List all token balances | Step 4: reading current wallet state |
| PayBox transaction reads | Recent activity history | Step 4: detecting new token arrivals |

**Important:** This skill NEVER calls PayBox write tools (`paybox_request_transfer`, swap, or any mutation). All wallet interaction is strictly read-only.

## Email

| Tool | Purpose | When to use |
|------|---------|-------------|
| `list_mailboxes` | Find active mailbox for alerts | Step 3: resolve sending address |
| `send-email` | Deliver security reports | Step 9: after user approval only |
| `search-emails` | Find previous sentinel reports | When checking historical alerts |
| `list-emails` | Scan inbox for phishing attempts | When correlating wallet threats with email |

## Workspace

| Tool | Purpose | When to use |
|------|---------|-------------|
| `list_workspaces` | Verify MCP connection | Step 1: always first |

## Knowledge Base (RAG)

| Tool | Purpose | When to use |
|------|---------|-------------|
| `recall-from-rag` | Look up known threat patterns | Step 6: before reporting |
| `upload-rag-document` | Store new threat indicators | Step 10: after analysis |
| `list-rag-documents` | Inventory stored patterns | When reviewing knowledge base |

## Tool Sequencing

```
list_workspaces
  → get_paybox_connection
    → list_mailboxes
      → [PayBox balance reads]
        → recall-from-rag
          → send-email (with approval)
            → upload-rag-document
```

Always follow this order. Never skip `get_paybox_connection` before wallet reads.
Never skip user approval before `send-email`.
