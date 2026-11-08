# Customer evidence templates

Use these structures without copying full customer messages into the output.

## Scope receipt

```markdown
Decision under review:
Workspace:
Mailbox email / public_id:
UTC date window:
Search query:
Candidate message limit:
Selected thread limit:
Frozen message IDs:
Frozen thread IDs:
Truncation or unavailable sources:
```

## Evidence register

```markdown
| Problem or outcome | Evidence kind | Source IDs / observed at | Account independence | Evidence | Counterevidence | Uncertainty | Band |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

## Decision brief

```markdown
### Supported decision

### What the evidence supports

### What it does not support

### Counterevidence and working alternatives

### Missing segments or context

### Smallest next test
```

## Interview queue

```markdown
| Thread ID | Verified account key or independence_unknown | Why this thread matters | Neutral question | Status |
| --- | --- | --- | --- | --- |
```

## Private continuation checkpoint

```json
{
  "workspace_id": "",
  "mailbox_public_id": "",
  "window_utc": {"from": "", "to": ""},
  "query": {},
  "candidate_message_ids": [],
  "selected_thread_ids": [],
  "unresolved_questions": []
}
```

Store the checkpoint privately. Do not commit customer data or source content to the skill repository.
