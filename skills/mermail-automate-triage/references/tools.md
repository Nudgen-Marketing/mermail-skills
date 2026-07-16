# Triage tool map

- `list_task_triagers`: discover configurations and the current default.
- `list_recent_triager_runs`: inspect recent execution state before troubleshooting.
- `create_task_triager`: create a new automation configuration.
- `update_task_triager`: change an existing configuration.
- `set_default_task_triager`: activate a selected configuration as default.
- `get_or_create_triager_conversation`: open the linked agent workflow.
- `delete_task_triager`: destructive; require approval and `prepare_destructive_action`.

Read live input schemas from MCP `tools/list`; keep this reference focused on sequencing and safety.
