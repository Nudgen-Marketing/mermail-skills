# Vet payment request — failure modes

Read this when a run stops early or returns less evidence than expected. Every
entry below was hit while building this skill against the live MCP server, not
inferred from documentation.

## `list_emails` returns an object, not a list

`list_emails` returns `{"items": [...]}` with each message's `body` inline. Code
that iterates the response directly gets the dict keys and silently finds nothing
to investigate.

```python
rows = resp.get("items", resp if isinstance(resp, list) else [])
```

Because `body` is already present, do not call `get_email` per row just to read
content. Reserve `get_email` for the single message under investigation.

## "Prior" compared by position instead of time

Filtering prior correspondence by "any other message from this sender" silently
includes messages that arrived *after* the request — including the request's own
replies. A payee introduced by the attacker then looks corroborated.

```python
t_when = str(target.get("created_at") or target.get("date") or "")
prior = [e for e in rows
         if e["id"] != target["id"]
         and str(e.get("sender") or e.get("from") or "") == sender
         and str(e.get("created_at") or e.get("date") or "") < t_when]
```

This inverts the verdict on exactly the scenario the skill exists to catch, and it
fails silently. Assert on it in any test corpus.

## `send_email` rejects a `from` outside the workspace

Attempting to seed a demo with an external sender returns
`details: ['from: Invalid input']`. This is correct anti-spoofing behaviour, not a
bug: `from` must be a workspace-owned address. Seed fixtures with a self-send and
put the impersonated identity in the display name and body.

This skill never sends anything; the note is here because building a reference
corpus does.

## `delete_email` requires a confirmation token

`delete_email` alone returns `Invalid arguments`. It requires a
`confirmationToken` obtained from `prepare_destructive_action`, single-use and
time-boxed. Cleanup scripts must call the prepare step first.

This is the pattern the rest of the ecosystem mostly lacks, and it is worth
copying: the affordance travels with the tool rather than depending on whichever
client happens to be mounted.

## Authentication fields are absent, not false

On messages with no upstream verdict, `sender_authentication` and `scan_status`
are `unknown` rather than `fail`. Code that tests truthiness treats absence as a
negative result and reports a scan that never ran. Render the three sub-verdicts
(`spf`, `dkim`, `dmarc`) individually and label a missing one `unknown`.

## A clean report is not a safe payment

Reporting `corroborated` means the three evidence checks passed against the
mailbox's own history. It does not mean the supplier's mailbox is uncompromised,
that the goods exist, or that the amount is correct. The skill produces evidence.
A human decides.
