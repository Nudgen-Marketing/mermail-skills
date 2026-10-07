#!/usr/bin/env python3
"""Publish every skills/* folder to ClawHub and classify CLI JSON statuses.

ClawHub staged publish returns exit 0 with status pending-publication (or
submitted) while security scans run. Treat those as success. Fail only on a
non-zero CLI exit, non-JSON stdout, or an unknown status.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

STATUS_KEYS = {
    "would-publish": "wouldPublish",
    "published": "published",
    "unchanged": "alreadySynced",
    "pending-publication": "pendingPublication",
    "submitted": "pendingPublication",
}


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes"}


def is_skill_folder(path: Path) -> bool:
    return path.is_dir() and any((path / name).is_file() for name in ("SKILL.md", "skill.md"))


def discover_targets(workspace: Path, root_input: str, skill_path: str) -> list[Path]:
    if skill_path:
        target = (workspace / skill_path).resolve()
        try:
            target.relative_to(workspace)
        except ValueError as exc:
            raise SystemExit(f"Publish path must be inside the repository: {skill_path}") from exc
        if not is_skill_folder(target):
            raise SystemExit(f"skill_path is not a skill folder: {skill_path}")
        return [target]

    root = (workspace / (root_input or "skills")).resolve()
    try:
        root.relative_to(workspace)
    except ValueError as exc:
        raise SystemExit(f"Publish root must be inside the repository: {root_input}") from exc
    if is_skill_folder(root):
        return [root]
    if not root.is_dir():
        raise SystemExit(f"No skill folders found under: {root_input}")

    discovered = [child for child in root.iterdir() if is_skill_folder(child.resolve())]
    if not discovered:
        raise SystemExit(f"No skill folders found under: {root_input}")
    return sorted(discovered, key=lambda child: child.name.lower())


def local_file_hashes(target: Path) -> dict[str, str]:
    return {
        path.relative_to(target).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(target.rglob("*"))
        if path.is_file()
    }


def inspect_existing_version(
    workspace: Path,
    target: Path,
    slug: str,
    version: str,
    site: str,
    registry: str,
    owner: str,
) -> dict | None:
    command = [
        "clawhub",
        "--workdir",
        str(workspace),
        "--site",
        site,
        "--registry",
        registry,
        "inspect",
        slug,
        "--version",
        version,
        "--files",
        "--json",
    ]
    completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True)
    if completed.returncode != 0:
        return None
    try:
        result = json.loads(completed.stdout)
        if owner and result.get("owner", {}).get("handle") != owner.lstrip("@"):
            return None
        remote_version = result.get("version") or {}
        remote_hashes = {
            item["path"]: item["sha256"] for item in remote_version.get("files", [])
        }
        if remote_version.get("version") != version or remote_hashes != local_file_hashes(target):
            return None
        return {
            "ok": True,
            "status": "unchanged",
            "slug": slug,
            "folder": target.relative_to(workspace).as_posix(),
            "version": version,
            "latestVersion": version,
            "fileCount": len(remote_hashes),
            "verifiedExistingVersion": True,
        }
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def main() -> int:
    workspace = Path(os.environ.get("GITHUB_WORKSPACE") or Path.cwd()).resolve()
    skill_path = os.environ.get("CLAWHUB_SKILL_PATH", "").strip()
    root_input = os.environ.get("CLAWHUB_ROOT", "").strip() or "skills"
    dry_run = env_flag("CLAWHUB_DRY_RUN")
    owner = os.environ.get("CLAWHUB_OWNER", "").strip()
    tags = os.environ.get("CLAWHUB_TAGS", "").strip()
    site = os.environ.get("CLAWHUB_SITE", "").strip() or "https://clawhub.ai"
    registry = os.environ.get("CLAWHUB_REGISTRY", "").strip() or "https://clawhub.ai"
    source_repository = os.environ.get("SOURCE_REPOSITORY", "").strip()
    source_ref = os.environ.get("SOURCE_REF", "").strip()

    targets = discover_targets(workspace, root_input, skill_path)
    source_commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=workspace, text=True
    ).strip()

    results: dict[str, list] = {
        "wouldPublish": [],
        "published": [],
        "alreadySynced": [],
        "pendingPublication": [],
        "skipped": [],
        "failed": [],
    }

    for target in targets:
        relative_path = target.relative_to(workspace).as_posix()
        command = [
            "clawhub",
            "--workdir",
            str(workspace),
            "--site",
            site,
            "--registry",
            registry,
            "skill",
            "publish",
            relative_path,
            "--json",
        ]
        if source_repository:
            command += ["--source-repo", source_repository, "--source-commit", source_commit]
            command += ["--source-path", relative_path]
        if dry_run:
            command.append("--dry-run")
        if owner:
            command += ["--owner", owner]
        if tags:
            command += ["--tags", tags]
        if source_ref:
            command += ["--source-ref", source_ref]

        completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True)
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip() or f"exit {completed.returncode}"
            match = re.search(r"Version ([0-9A-Za-z.+-]+) already exists", message)
            existing = (
                inspect_existing_version(
                    workspace, target, target.name, match.group(1), site, registry, owner
                )
                if match
                else None
            )
            if existing:
                results["alreadySynced"].append(existing)
                continue
            results["failed"].append(
                {"slug": target.name, "folder": relative_path, "message": message}
            )
            continue
        try:
            result = json.loads(completed.stdout)
            status = result["status"]
            results[STATUS_KEYS[status]].append(result)
        except json.JSONDecodeError as exc:
            results["failed"].append(
                {
                    "slug": target.name,
                    "folder": relative_path,
                    "message": f"Invalid publish output: {exc}",
                }
            )
        except KeyError as exc:
            results["failed"].append(
                {
                    "slug": target.name,
                    "folder": relative_path,
                    "message": f"Invalid publish output: {exc.args[0]}",
                }
            )

    output = {
        "ok": not results["failed"],
        "dryRun": dry_run,
        "registry": registry,
        "roots": [skill_path or root_input],
        **({"owner": owner.lstrip("@")} if owner else {}),
        "summary": {key: len(value) for key, value in results.items()},
        **results,
    }
    print(json.dumps(output, indent=2))
    return 1 if results["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
