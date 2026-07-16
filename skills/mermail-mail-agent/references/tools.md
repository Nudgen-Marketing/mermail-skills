# Mail-agent tool map

## Conversation state

- `list_agent_conversations`
- `list_agent_messages`
- `create_agent_conversation`
- `rename_agent_conversation`

## Agent execution

- `chat_with_mailbox_agent` — treat as an external effect and constrain the requested action explicitly.

## Destructive

- `delete_agent_conversation` — require explicit approval and a token from `prepare_destructive_action`.

Inspect live schemas with MCP `tools/list`. Distinguish agent narrative from tool-confirmed execution in the final report.
