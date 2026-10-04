#!/usr/bin/env python3
"""Controlled publisher tests. The CLI is a recorder; nothing is uploaded."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("publisher", ROOT / "scripts/clawhub-ci-publish.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublishingSecurity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="mermail-publish-security-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.workspace = self.base / "repository"
        self.skill = self.workspace / "skills/example"
        self.skill.mkdir(parents=True)
        (self.skill / "SKILL.md").write_text("Synthetic public skill only.\n")
        self.outside = self.base / "outside"
        self.outside.mkdir()
        (self.outside / "SKILL.md").write_text("Synthetic outside fixture.\n")
        (self.outside / "fixture.txt").write_text("Synthetic harmless outside content.\n")

    def test_regular_package_is_discovered_and_hashed(self):
        self.assertEqual(publisher.discover_targets(self.workspace, "skills", ""), [self.skill])
        self.assertEqual(set(publisher.local_file_hashes(self.skill)), {"SKILL.md"})

    def test_discovered_directory_symlink_cannot_escape_workspace(self):
        (self.workspace / "skills/escape").symlink_to(self.outside, target_is_directory=True)
        with self.assertRaisesRegex(SystemExit, "symbolic links|inside the repository"):
            publisher.discover_targets(self.workspace, "skills", "")

    def test_explicit_directory_symlink_is_rejected(self):
        (self.workspace / "skills/escape").symlink_to(self.outside, target_is_directory=True)
        with self.assertRaisesRegex(SystemExit, "symbolic links|inside the repository"):
            publisher.discover_targets(self.workspace, "skills", "skills/escape")

    def test_nested_file_and_directory_symlinks_are_rejected_before_hashing(self):
        for is_dir in (False, True):
            link = self.skill / "escape"
            link.symlink_to(self.outside if is_dir else self.outside / "fixture.txt", target_is_directory=is_dir)
            with self.assertRaisesRegex(SystemExit, "symbolic links"):
                publisher.discover_targets(self.workspace, "skills", "")
            with self.assertRaisesRegex(SystemExit, "symbolic links"):
                publisher.local_file_hashes(self.skill)
            link.unlink()

    def test_even_inside_workspace_links_are_not_packaged(self):
        (self.skill / "copy.md").symlink_to(self.skill / "SKILL.md")
        with self.assertRaisesRegex(SystemExit, "symbolic links"):
            publisher.discover_targets(self.workspace, "skills", "")

    def test_path_traversal_is_rejected_for_root_and_explicit_target(self):
        for root, target in (("../outside", ""), ("skills", "../outside")):
            with self.assertRaisesRegex(SystemExit, "inside the repository"):
                publisher.discover_targets(self.workspace, root, target)

    def prepare_shell(self):
        scripts = self.workspace / "scripts"
        scripts.mkdir(exist_ok=True)
        shutil.copy2(ROOT / "scripts/publish-clawhub.sh", scripts / "publish-clawhub.sh")
        (self.workspace / "package.json").write_text(json.dumps({"version": "0.0.0"}))
        binary = self.base / "bin"
        binary.mkdir(exist_ok=True)
        recorder = binary / "clawhub"
        recorder.write_text("#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ['MOCK_PUBLISH_RECORD'],'a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')\n")
        recorder.chmod(0o755)
        return scripts / "publish-clawhub.sh", binary

    def run_shell(self, live):
        script, binary = self.prepare_shell()
        record = self.base / "calls.jsonl"
        record.write_text("")
        env = {"PATH": str(binary) + os.pathsep + os.environ["PATH"], "CLAWHUB_LIVE": live,
               "CLAWHUB_VERSION": "0.0.0", "CLAWHUB_OWNER": "synthetic-only", "MOCK_PUBLISH_RECORD": str(record)}
        result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, timeout=5)
        calls = [json.loads(line) for line in record.read_text().splitlines()]
        return result, calls

    def test_negative_and_empty_live_flags_stay_dry(self):
        for flag in ("", "0", "false", "no"):
            result, calls = self.run_shell(flag)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(calls)
            self.assertTrue(all("--dry-run" in args for args in calls))

    def test_invalid_flag_stops_before_publish_and_one_is_the_only_opt_in(self):
        for flag in ("true", "yes", "-1", "unexpected"):
            result, calls = self.run_shell(flag)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(calls, [])
        result, calls = self.run_shell("1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(calls)
        self.assertTrue(all("--dry-run" not in args for args in calls))

    def test_shell_rejects_symlinks_before_any_package_publication(self):
        (self.skill / "escape").symlink_to(self.outside, target_is_directory=True)
        result, calls = self.run_shell("1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
