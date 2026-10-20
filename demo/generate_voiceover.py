#!/usr/bin/env python3
"""Read offline narration only; no key loading or speech-provider calls."""
from pathlib import Path
if __name__ == "__main__":
    print((Path(__file__).resolve().parent / "voiceover_script.txt").read_text())
