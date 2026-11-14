"""Private local JSON storage with compare-before-replace and an exclusive lock.

No network, credentials, background work or automatic stale-lock removal.
Caller must independently choose/authorize the local path. Not a distributed DB.
"""
import json
import os
import tempfile
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024


def _path(value):
    path = Path(value).absolute()
    if not path.parent.is_dir() or path.is_symlink():
        raise ValueError("Use an existing private directory and a non-symlink file")
    if path.parent.resolve() != path.parent:
        raise ValueError("Symlink parent paths are not supported")
    return path


def _bytes(path):
    if not path.exists():
        return None
    if not path.is_file():
        raise ValueError("Ledger must be a regular file")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as handle:
        data = handle.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("Ledger exceeds 2 MiB; select a reviewed archival plan")
    return data


def load_ledger(value):
    data = _bytes(_path(value))
    if data is None:
        return None, None
    ledger = json.loads(data)
    if not isinstance(ledger, dict) or not isinstance(ledger.get("items"), list):
        raise ValueError("Invalid ledger; preserve it for review")
    ids = [item.get("id") for item in ledger["items"]]
    if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
        raise ValueError("Invalid or duplicate item identities")
    return ledger, data


def save_ledger(value, ledger, expected):
    path = _path(value)
    payload = (json.dumps(ledger, indent=2, ensure_ascii=True) + "\n").encode()
    if len(payload) > MAX_BYTES:
        raise ValueError("Ledger exceeds 2 MiB")
    lock = path.with_name(path.name + ".lock")
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temporary = None
    try:
        os.close(fd)
        if _bytes(path) != expected:
            raise ValueError("Ledger changed since read; stop and re-review")
        fd, temporary = tempfile.mkstemp(prefix=".commitment-", dir=path.parent)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary:
            os.unlink(temporary)
        os.unlink(lock)
