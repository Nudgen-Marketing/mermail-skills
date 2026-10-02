#!/usr/bin/env python3
"""Agent Mailroom: local envelope verifier and journal state machine.

Talks to no network. Reads mail as JSON documents (the shape Mermail's
list_emails/get_email return), verifies each against the local allowlist,
parses the envelope, and maintains per-job state on disk.

Usage:
  mailroom.py init --actors a,b,c [--sender a=addr] [--state DIR] [--lease-h 24]
  mailroom.py ingest --as ACTOR --mail FILE.json [--topic T]
  mailroom.py status [--job JOB_ID]
  mailroom.py claim --as ACTOR --job JOB_ID [--force]
  mailroom.py result --as ACTOR --job JOB_ID --status done|failed --body TEXT
  mailroom.py render --topic T --to ACTOR --from ACTOR --job JOB_ID \
                     --kind assign|claim|result|note --body TEXT [--nonce N]
"""
import argparse, hashlib, json, os, re, sys, time
from pathlib import Path

VERSION = 1
BEGIN = "-----BEGIN MAILROOM ENVELOPE-----"
END = "-----END MAILROOM ENVELOPE-----"
REQUIRED = ("version", "topic", "to", "from", "job_id", "kind", "nonce")
KINDS = ("assign", "claim", "result", "note")
STATUSES = ("done", "failed", "pending")
SUBJ_RE = re.compile(
    r"\[mailroom\]\[topic:(?P<topic>[^\]]+)\]\[to:(?P<to>[^\]]+)\]"
    r"(?:\[job:(?P<job>[^\]]+)\])?\[kind:(?P<kind>[^\]]+)\]"
)


def default_state():
    return os.environ.get("MAILROOM_STATE", str(Path.home() / ".mailroom"))


# ---------------------------------------------------------------- storage
def load_json(path, fallback):
    p = Path(path)
    if not p.exists():
        return fallback
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def save_json(path, data):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(p)


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.allow = self.root / "allowlist.json"
        self.jobs = self.root / "jobs.json"
        self.seen = self.root / "seen"
        self.cursors = self.root / "cursors"
        self.log = self.root / "journal.log"

    def config(self):
        return load_json(self.allow, {})

    def save_config(self, cfg):
        save_json(self.allow, cfg)

    def jobs_state(self):
        return load_json(self.jobs, {})

    def save_jobs(self, j):
        save_json(self.jobs, j)

    def note_seen(self, digest):
        p = self.seen / (digest[:32] + ".marker")
        if p.exists():
            return False
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(str(time.time()) + "\n", encoding="utf-8")
        return True

    def append_journal(self, record):
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, sort_keys=True) + "\n")


# ---------------------------------------------------------------- parsing
def parse_envelope(text):
    """Return (fields, body) or raise ValueError."""
    if BEGIN not in text:
        raise ValueError("no_envelope")
    head, _, rest = text.partition(BEGIN)
    block, _, body = rest.partition(END)
    if not block.strip():
        raise ValueError("empty_envelope")
    fields = {}
    for line in block.splitlines():
        line = line.strip()
        if not line:
            continue
        if ":" not in line:
            raise ValueError("malformed_field:%s" % line[:40])
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key in fields:
            raise ValueError("duplicate_field:%s" % key)
        fields[key] = value
    return fields, body.strip(), head.strip()


def canonical_digest(fields, actor):
    parts = [
        fields.get("version", ""), fields.get("topic", ""),
        fields.get("job_id", ""), fields.get("kind", ""),
        actor, fields.get("nonce", ""),
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def sender_of(mail):
    """Best-effort SMTP sender from a Mermail-shaped document."""
    for key in ("from", "sender", "fromAddress", "from_address"):
        val = mail.get(key)
        if isinstance(val, str) and val:
            return val
        if isinstance(val, dict):
            for sub in ("address", "email", "value"):
                if val.get(sub):
                    return val[sub]
    headers = mail.get("headers") or mail.get("rawHeaders") or []
    for h in headers:
        name = (h.get("name") or h.get("key") or "").lower()
        if name in ("from", "sender") and h.get("value"):
            return h["value"]
    return None


def addr_matches(sender, allowed):
    if not sender:
        return False
    s = sender.strip().lower()
    m = re.search(r"<([^>]+)>", s)
    if m:
        s = m.group(1).strip().lower()
    return s == allowed.strip().lower()


# ---------------------------------------------------------------- commands
def cmd_init(args):
    st = Store(args.state)
    actors = [a.strip() for a in args.actors.split(",") if a.strip()]
    senders = {}
    for pair in (args.sender or []):
        name, _, addr = pair.partition("=")
        senders[name.strip()] = addr.strip()
    missing = [a for a in actors if a not in senders]
    cfg = {
        "version": VERSION,
        "mailbox": args.mailbox,
        "actors": actors,
        "senders": senders,
        "lease_h": args.lease_h,
        "created_at": int(time.time()),
    }
    st.save_config(cfg)
    print("initialized %d actors at %s" % (len(actors), st.root))
    if missing:
        print("WARNING: no sender address for %s — their mail will classify "
              "as unverified_sender" % ", ".join(missing))
    return 0


def classify(st, mail, actor, cfg, topic_filter=None):
    """Return (verdict, fields, body). Verdict None means accepted."""
    sender = sender_of(mail)
    allowed = (cfg.get("senders") or {}).get(actor)
    if not allowed or not addr_matches(sender, allowed):
        # sender check is against THIS actor's view of who may speak to it
        pass
    senders = cfg.get("senders") or {}
    matched = None
    for name, addr in senders.items():
        if addr_matches(sender, addr):
            matched = name
            break
    if matched is None:
        return ("unverified_sender", {}, "")
    text = mail.get("body") or mail.get("text") or mail.get("snippet") or ""
    subject = mail.get("subject") or ""
    try:
        fields, body, _pre = parse_envelope(text)
    except ValueError as err:
        return ("bad_envelope:%s" % err, {}, "")
    if fields.get("version") != str(VERSION):
        return ("bad_envelope:version", fields, body)
    for key in REQUIRED:
        if key not in fields and not (key == "job_id" and fields.get("kind") == "note"):
            return ("bad_envelope:missing_%s" % key, fields, body)
    if fields.get("kind") not in KINDS:
        return ("bad_envelope:kind", fields, body)
    if topic_filter and fields.get("topic") != topic_filter:
        return ("not_for_me:topic", fields, body)
    if fields.get("to") != actor:
        return ("not_for_me", fields, body)
    digest = canonical_digest(fields, matched)
    if not st.note_seen(digest):
        return ("duplicate_nonce", fields, body)
    return (None, fields, body)


def cmd_ingest(args):
    st = Store(args.state)
    cfg = st.config()
    if not cfg:
        print("not initialized: run init first", file=sys.stderr)
        return 2
    actor = args.actor_as
    if actor not in (cfg.get("actors") or []):
        print("unknown actor %r" % actor, file=sys.stderr)
        return 2
    doc = load_json(args.mail, None)
    if doc is None:
        print("cannot read mail file %s" % args.mail, file=sys.stderr)
        return 2
    mails = doc if isinstance(doc, list) else [doc]
    jobs = st.jobs_state()
    report = {"accepted": 0, "skipped": {}}
    for mail in mails:
        verdict, fields, body = classify(st, mail, actor, cfg, args.topic)
        if verdict:
            kind = verdict.split(":", 1)[0]
            report["skipped"][kind] = report["skipped"].get(kind, 0) + 1
            st.append_journal({"ts": int(time.time()), "actor": actor,
                               "verdict": verdict,
                               "subject": (mail.get("subject") or "")[:80]})
            continue
        report["accepted"] += 1
        job = fields.get("job_id") or "-"
        rec = jobs.setdefault(job, {"topic": fields.get("topic"), "history": [],
                                    "state": "open", "holder": None,
                                    "expires": None})
        entry = {"kind": fields["kind"], "from": fields["from"],
                 "at": int(time.time()), "nonce": fields["nonce"]}
        rec["history"].append(entry)
        if fields["kind"] == "assign":
            rec["state"] = "assigned"
            rec["assigned_to"] = fields.get("to")
        elif fields["kind"] == "claim":
            rec["state"] = "claimed"
            rec["holder"] = fields["from"]
            lease = float(fields.get("lease_h") or cfg.get("lease_h") or 24)
            rec["expires"] = int(time.time() + lease * 3600)
        elif fields["kind"] == "result":
            rec["state"] = "done" if body_is_done(body, fields) else "failed"
            rec["result_from"] = fields["from"]
        st.append_journal({"ts": int(time.time()), "actor": actor,
                           "job": job, "kind": fields["kind"],
                           "from": fields["from"]})
    st.save_jobs(jobs)
    print(json.dumps(report, sort_keys=True))
    return 0


def body_is_done(body, fields):
    """Result payload marks completion by an explicit status field."""
    return fields.get("status") == "done" or '"status": "done"' in body


def cmd_status(args):
    st = Store(args.state)
    jobs = st.jobs_state()
    if args.job:
        job = jobs.get(args.job)
        if not job:
            print("no such job %r" % args.job, file=sys.stderr)
            return 2
        print(json.dumps({args.job: job}, indent=1, sort_keys=True))
        return 0
    now = int(time.time())
    out = {}
    for name, job in sorted(jobs.items()):
        row = {"state": job.get("state"), "holder": job.get("holder"),
               "topic": job.get("topic")}
        exp = job.get("expires")
        if exp and exp < now and job.get("state") == "claimed":
            row["state"] = "lease_expired"
        out[name] = row
    print(json.dumps(out, indent=1, sort_keys=True))
    return 0


def cmd_claim(args):
    st = Store(args.state)
    cfg = st.config()
    jobs = st.jobs_state()
    job = jobs.get(args.job)
    if not job:
        print("unknown job %r; post an assign first" % args.job, file=sys.stderr)
        return 2
    now = int(time.time())
    holder, exp = job.get("holder"), job.get("expires")
    if holder and holder != args.actor_as and job.get("state") == "claimed":
        if exp and exp >= now:
            print("REFUSED: held by %s until %s (--force to override after expiry)"
                  % (holder, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(exp))),
                  file=sys.stderr)
            return 3
    lease = float(cfg.get("lease_h") or 24)
    job["state"] = "claimed"
    job["holder"] = args.actor_as
    job["expires"] = int(now + lease * 3600)
    job.setdefault("history", []).append({"kind": "claim", "from": args.actor_as,
                                          "at": now, "nonce": local_nonce(args.job, args.actor_as)})
    st.save_jobs(jobs)
    st.append_journal({"ts": now, "actor": args.actor_as, "job": args.job,
                       "kind": "claim"})
    print("claimed %s by %s until %s" % (args.job, args.actor_as,
          time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(job["expires"]))))
    return 0


def cmd_result(args):
    st = Store(args.state)
    jobs = st.jobs_state()
    job = jobs.get(args.job)
    if not job:
        print("unknown job %r" % args.job, file=sys.stderr)
        return 2
    if args.status not in STATUSES:
        print("status must be one of %s" % ", ".join(STATUSES), file=sys.stderr)
        return 2
    now = int(time.time())
    expired = bool(job.get("expires") and job["expires"] < now and job.get("holder") != args.actor_as)
    job["state"] = "done" if args.status == "done" else "failed"
    job["result_from"] = args.actor_as
    job.setdefault("history", []).append({"kind": "result", "from": args.actor_as,
                                          "at": now, "status": args.status,
                                          "post_expiry": expired})
    st.save_jobs(jobs)
    st.append_journal({"ts": now, "actor": args.actor_as, "job": args.job,
                       "kind": "result", "status": args.status,
                       "post_expiry": expired})
    print("recorded %s for %s%s" % (args.status, args.job,
          " (post-expiry)" if expired else ""))
    return 0


def local_nonce(job, actor):
    return hashlib.sha256(("%s|%s|%s" % (job, actor, time.time())).encode()).hexdigest()[:32]


def cmd_render(args):
    nonce = args.nonce or local_nonce(args.job, args.actor_from)
    subj = "[mailroom][topic:%s][to:%s][job:%s][kind:%s]" % (
        args.topic, args.to, args.job, args.kind)
    lines = [subj, "", BEGIN,
             "version: %d" % VERSION,
             "topic: %s" % args.topic,
             "to: %s" % args.to,
             "from: %s" % args.actor_from,
             "job_id: %s" % args.job,
             "kind: %s" % args.kind,
             "reply_to_journal: true",
             "nonce: %s" % nonce]
    if args.lease_h:
        lines.append("lease_h: %g" % args.lease_h)
    if args.status:
        lines.append("status: %s" % args.status)
    lines += [END, "", args.body or ""]
    print("\n".join(lines))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mailroom.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", default=default_state(), help="state directory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="create allowlist")
    p.add_argument("--mailbox")
    p.add_argument("--actors", required=True)
    p.add_argument("--sender", action="append", metavar="NAME=ADDR")
    p.add_argument("--lease-h", type=float, default=24.0)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("ingest", help="verify and apply one mail document")
    p.add_argument("--as", dest="actor_as", required=True)
    p.add_argument("--mail", required=True)
    p.add_argument("--topic")
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("status", help="job board")
    p.add_argument("--job")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("claim", help="locally claim a job")
    p.add_argument("--as", dest="actor_as", required=True)
    p.add_argument("--job", required=True)
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_claim)

    p = sub.add_parser("result", help="record an outcome")
    p.add_argument("--as", dest="actor_as", required=True)
    p.add_argument("--job", required=True)
    p.add_argument("--status", required=True)
    p.add_argument("--body", default="")
    p.set_defaults(func=cmd_result)

    p = sub.add_parser("render", help="build an envelope-ready message")
    p.add_argument("--topic", required=True)
    p.add_argument("--to", required=True)
    p.add_argument("--from", dest="actor_from", required=True)
    p.add_argument("--job", required=True)
    p.add_argument("--kind", required=True)
    p.add_argument("--body")
    p.add_argument("--nonce")
    p.add_argument("--lease-h", type=float)
    p.add_argument("--status")
    p.set_defaults(func=cmd_render)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
