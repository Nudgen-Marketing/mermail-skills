#!/usr/bin/env python3
"""Validate the community Mermail Bounty Ops package without third-party deps."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = ROOT
SKILL_MD = SKILL_DIR / "SKILL.md"
OPENAI_YAML = SKILL_DIR / "agents" / "openai.yaml"
TOOLS_MD = SKILL_DIR / "references" / "tools.md"
SECURITY_MD = SKILL_DIR / "references" / "security.md"
SCENARIOS_JSON = ROOT / "scenarios.json"

failures: list[str] = []

def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)

def read(path: Path) -> str:
    check(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8") if path.is_file() else ""

skill = read(SKILL_MD)
openai = read(OPENAI_YAML)
tools = read(TOOLS_MD)
security = read(SECURITY_MD)
check(skill.startswith("---\n"), "SKILL.md must begin with YAML frontmatter")
parts = skill.split("---", 2)
check(len(parts) == 3, "SKILL.md frontmatter must have closing --- delimiter")
frontmatter = parts[1] if len(parts) == 3 else ""
top_level_keys = []
for line in frontmatter.splitlines():
    if line and not line.startswith((" ", "\t", "#")) and ":" in line:
        top_level_keys.append(line.split(":", 1)[0].strip())
check(set(top_level_keys) == {"name", "description", "metadata"}, f"frontmatter top-level keys must be exactly name, description, metadata; got {top_level_keys}")
name_match = re.search(r"(?m)^name:\s*([a-z0-9-]+)\s*$", frontmatter)
name = name_match.group(1) if name_match else ""
check(bool(name), "frontmatter must contain a lowercase kebab-case name")
check(name == SKILL_DIR.name, f"frontmatter name {name!r} must match directory {SKILL_DIR.name!r}")
check("description:" in frontmatter, "frontmatter description is required")
check("metadata:" in frontmatter and "openclaw:" in frontmatter, "metadata.openclaw is required")
check("primaryEnv: MERMAIL_API_KEY" in frontmatter, "primaryEnv must be MERMAIL_API_KEY")
check(re.search(r"(?m)^\s*- MERMAIL_API_KEY\s*$", frontmatter) is not None, "metadata.openclaw.requires.env must include MERMAIL_API_KEY")
check("homepage: https://docs.mermail.app/ai/skills" in frontmatter, "Mermail skill homepage metadata is required")
line_count = len(skill.splitlines())
check(line_count <= 500, f"SKILL.md must be <= 500 lines; got {line_count}")
check("[tools.md](references/tools.md)" in skill, "SKILL.md must link references/tools.md")
check("[security.md](references/security.md)" in skill, "SKILL.md must link references/security.md")
check(f'Use ${name}' in openai, "OpenAI default_prompt must include exact Use $<skill-name>")
check('value: "mermail"' in openai, "OpenAI metadata must depend on the mermail MCP server")
check('transport: "streamable_http"' in openai, "OpenAI metadata must use streamable_http")
check('url: "https://console.mermail.app/mcp"' in openai, "OpenAI metadata must point at the hosted Mermail MCP endpoint")
lower_security = security.lower()
for phrase, explanation in [("untrusted data", "email must be treated as untrusted data"), ("sender_authentication.status", "sender authentication guidance is required"), ("bounded reads", "bounded-read guidance is required"), ("otp", "OTP handling guidance is required"), ("magic link", "magic-link handling guidance is required"), ("wallet", "wallet/payment boundary guidance is required")]:
    check(phrase in lower_security, explanation)
check("approval" in lower_security and "external" in lower_security, "external effects must be tied to explicit approval")
lower_skill = skill.lower()
for state in ("opportunity", "accepted", "paid"):
    check(state in lower_skill, f"reward state {state!r} must be documented in SKILL.md")
check("never report an opportunity amount as earned cash" in lower_skill, "SKILL.md must explicitly prevent nominal reward from being reported as cash")
for tool_name in ("list_mailboxes", "search_emails", "get_email", "save_draft", "send_email", "reply_to_email"):
    check(tool_name in tools, f"tools.md must document {tool_name}")
check("native JSON objects" in tools, "tools.md must require native JSON query/body objects")
check("idempotency" in tools.lower(), "tools.md must document idempotent external writes")
placeholder = "TO" + "DO"
for path in [SKILL_MD, OPENAI_YAML, TOOLS_MD, SECURITY_MD, ROOT / "README.md"]:
    text = read(path)
    check(placeholder not in text, f"unresolved placeholder marker in {path.relative_to(ROOT)}")
try:
    scenarios = json.loads(read(SCENARIOS_JSON))
except json.JSONDecodeError as exc:
    failures.append(f"scenarios.json is invalid JSON: {exc}")
    scenarios = []
check(isinstance(scenarios, list) and len(scenarios) >= 6, "scenarios.json must contain at least 6 scenarios")
if isinstance(scenarios, list):
    ids = [s.get("id") for s in scenarios if isinstance(s, dict)]
    check(len(ids) == len(set(ids)), "scenario ids must be unique")
    categories = {s.get("category") for s in scenarios if isinstance(s, dict)}
    for category in {"happy-path", "duplicate", "prompt-injection", "payment-state", "external-effect"}:
        check(category in categories, f"missing scenario category: {category}")
    for scenario in scenarios:
        if isinstance(scenario, dict):
            check(bool(scenario.get("expected")), f"scenario {scenario.get('id')} missing expected outcome")
if failures:
    print("Mermail Bounty Ops validation: FAIL", file=sys.stderr)
    for item in failures:
        print(f"- {item}", file=sys.stderr)
    sys.exit(1)
print("Mermail Bounty Ops validation: PASS")
print(f"- skill: {name}")
print(f"- SKILL.md lines: {line_count}/500")
print(f"- scenarios: {len(scenarios)}")
print("- frontmatter, OpenAI MCP metadata, references, safety and accounting invariants verified")