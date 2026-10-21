# Vet payment request — failure modes

Read this when a run stops early or returns less evidence than expected. Historical
live observations below are not a current integration guarantee. The timestamp
example is an offline deterministic illustration, not a deployed helper or model test.

## `list_emails` returns an object, not a list

`list_emails` returns `{"items": [...]}`. Item content depends on the safety query. Code
that iterates the response directly gets the dict keys and silently finds nothing
to investigate.

```python
rows = resp.get("items", []) if isinstance(resp, dict) else resp if isinstance(resp, list) else []
```

Metadata-only discovery omits bodies. Read only selected evidence with the native
clean-scan, agent-safe, bounded `get_email` query in [tools.md](tools.md), including
prior correspondence needed for corroboration. A body inline in an older/default
response is not permission to bypass scan, omission or truncation gates.

## "Prior" compared by position instead of time

Filtering prior correspondence by "any other message from this sender" silently
includes messages that arrived *after* the request — including the request's own
replies. Comparing timestamp strings also fails across zones: `08:30-02:00` is
later than `09:00Z`, whereas `10:00+02:00` is earlier. A payee introduced by the
attacker then looks corroborated. Parse authoritative message timestamps into
UTC instants first; the request must have a valid timestamp before history can
be classified. Equal instants are not prior, even with different zone spellings.

The following time-filter illustration assumes rows have already been scoped to
the exact mailbox/correspondent and selected through the scan gates. It neither
fetches evidence nor authenticates a sender. Invalid, absent, zone-less or
over-precision times are explicitly unusable, never interpreted in local time:

```python
import re
from datetime import datetime, timedelta, timezone

ZONED_TIME = re.compile(
    r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)"
)

def utc_instant(value):
    if not isinstance(value, str) or not ZONED_TIME.fullmatch(value):
        raise ValueError("missing or unsupported zoned message timestamp")
    try:
        at = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if abs(at.utcoffset()) > timedelta(hours=14):
            raise ValueError("invalid message timezone offset")
        return at.astimezone(timezone.utc)  # invalid calendar dates never roll over
    except (ValueError, OverflowError) as error:
        raise ValueError("invalid message timestamp") from error

def message_instant(message):
    value = message.get("created_at")
    return utc_instant(message.get("date") if value is None else value)

def prior_messages(rows, target, sender):
    t_when = message_instant(target)  # invalid target stops the temporal conclusion
    prior, unusable_time_ids = [], []
    for e in rows:
        if e.get("id") == target["id"] or str(e.get("sender") or e.get("from") or "") != sender:
            continue
        try:
            earlier = message_instant(e) < t_when
        except ValueError:
            unusable_time_ids.append(e.get("id"))
            continue
        if earlier:
            prior.append(e)
    return sorted(prior, key=message_instant), unusable_time_ids
```

Report unusable timestamps and partial history; do not convert them into a
no-history finding or a corroborated amount/payee. A timestamp inside a quoted
body is not the authoritative message time. This comparison uses at most six
fractional digits without rounding; unsupported precision remains incomplete.

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
