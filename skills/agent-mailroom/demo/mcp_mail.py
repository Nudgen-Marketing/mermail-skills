#!/usr/bin/env python3
"""Mermail MCP helper: send_email / search_emails via the console MCP endpoint."""
import json, sys, urllib.request, argparse

MCP = "https://console.mermail.app/mcp"
API_KEY = None  # set from env MERMAIL_API_KEY
HDRS = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
        "X-API-Key": None, "User-Agent": "mermail-mailroom-demo/1.0"}


def _rpc(payload):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(MCP, data=body, headers={k: v for k, v in HDRS.items() if v})
    raw = urllib.request.urlopen(req, timeout=30).read().decode()
    for line in raw.split('\n'):
        if line.startswith('data:'):
            return json.loads(line[5:])
    return json.loads(raw)


def send_email(mailbox_id, to, subject, text):
    r = _rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "send_email", "arguments": {"mailboxId": mailbox_id, "body": {
            "to": to, "from": mailbox_id, "subject": subject, "text": text}}}})
    content = r.get('result', {}).get('content', [])
    out = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
    if r.get('result', {}).get('isError'):
        print(out, file=sys.stderr); sys.exit(1)
    return json.loads(out)


def search_emails(mailbox_id, text_query):
    r = _rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "search_emails", "arguments": {"mailboxId": mailbox_id, "query": {"text": text_query}}}})
    content = r.get('result', {}).get('content', [])
    out = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
    return json.loads(out)


def get_email(mailbox_id, email_id):
    r = _rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "get_email", "arguments": {"mailboxId": mailbox_id, "emailId": email_id}}})
    content = r.get('result', {}).get('content', [])
    out = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
    return json.loads(out)


def list_mailboxes():
    r = _rpc({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "list_mailboxes", "arguments": {}}})
    content = r.get('result', {}).get('content', [])
    out = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
    return json.loads(out)


def main():
    global API_KEY
    import os
    API_KEY = os.environ.get("MERMAIL_API_KEY")
    HDRS["X-API-Key"] = API_KEY
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["send", "search", "mailboxes", "get"])
    ap.add_argument("--mailbox", default="dsbroketimesagent@mermail.app")
    ap.add_argument("--to", default="dsbroketimesagent@mermail.app")
    ap.add_argument("--subject")
    ap.add_argument("--body-file")
    ap.add_argument("--query", default="mailroom")
    ap.add_argument("--out")
    a = ap.parse_args()
    if a.cmd == "send":
        text = open(a.body_file).read() if a.body_file else a.subject or ""
        res = send_email(a.mailbox, a.to, a.subject, text)
        print(json.dumps(res))
    elif a.cmd == "get":
        import json as _j
        ids = [l.strip().lstrip('- ').split('|')[0].strip() for l in open(a.body_file) if l.startswith('- ')] if a.body_file else [a.subject]
        e = get_email(a.mailbox, ids[0])
        open(a.out or 'inbox.json', 'w').write(_j.dumps([e], indent=1))
        print('fetched email %s (%d bytes body)' % (ids[0][:8], len(e.get('body', ''))))
    elif a.cmd == "search":
        res = search_emails(a.mailbox, a.query)
        if a.out:
            lines = ["- %s | %s | from %s | %s" % (e.get("id", ""), str(e.get("subject", ""))[:52], e.get("sender", "")[:30], e.get("date", "")[:19]) for e in res.get("emails", [])]
            open(a.out, "w").write("\n".join(lines) + "\n")
        for e in res.get("emails", []):
            print("- %s | %s | %s" % (e.get("id", "")[:13], str(e.get("subject", ""))[:44], e.get("date", "")[:16]))
        print("(%d matching emails)" % len(res.get("emails", [])))
    else:
        for m in list_mailboxes():
            print("- %s (%s)" % (m.get("email", m.get("public_id")), m.get("name", "")))


if __name__ == '__main__':
    main()
