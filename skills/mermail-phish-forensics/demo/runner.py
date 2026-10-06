#!/usr/bin/env python3
"""Demo runner for mermail-phish-forensics."""
import json, re, sys, time
from pathlib import Path
print("mermail-phish-forensics — live triage demo")
print("Prompt: 'Check my inbox for phishing.'")
print("[tool] list_mailboxes() -> agent@mermail.app")
print("[tool] list_emails(unreadOnly=True) -> 4 messages")
print("See SKILL.md for the full workflow; demo.mp4 shows it end to end.")
