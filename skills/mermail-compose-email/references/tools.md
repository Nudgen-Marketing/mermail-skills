# Composition tool map

| Intent | Tool | Effect |
| --- | --- | --- |
| Save editable content | `save_draft` | Internal write |
| Regenerate draft with AI | `regenerate_draft` | Internal write and AI usage |
| Send new email | `send_email` | External effect |
| Reply to email | `reply_to_email` | External effect |
| Forward email | `forward_email` | External effect |
| Schedule delivery | `schedule_email_send` | Deferred external effect |

Inspect each tool's current input schema through MCP `tools/list`. Do not invent body fields from this reference.
