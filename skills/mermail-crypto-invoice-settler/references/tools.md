# Tools Reference: Crypto Invoice Settler

## Core Mermail MCP Tools

| Tool Name | Type | Purpose in Skill |
| :--- | :--- | :--- |
| `list_mailboxes` | Read | Identify primary mailbox for invoice operations. |
| `search_emails` | Read | Query threads containing invoice and payment keywords. |
| `get_thread` | Read | Retrieve full message thread and attachment metadata. |
| `create_draft` | Write | Draft payment confirmation reply to contractor. |
| `save_draft` | Write | Update draft with confirmed transaction hash. |
| `get_paybox_connection` | Read | Probe PayBox connection status and active chains. |
| `paybox_request_transfer` | Write | Stage on-chain token transfer for invoice payment. |
| `paybox_get_request` | Read | Query terminal settlement status of staged transfer. |
