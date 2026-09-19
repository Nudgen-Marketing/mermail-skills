#!/usr/bin/env python3
"""
Automated Demo Presentation Orchestrator.
Plays the ElevenLabs narration and synchronizes the terminal display in real-time.
Run this script while recording your screen (Win + Alt + R or OBS).
"""

import os
import sys
import time
import subprocess
from pathlib import Path

def play_audio_powershell(audio_path: Path):
    """Play MP3 in background using Windows Media Player COM object."""
    abs_path = audio_path.resolve()
    ps_code = f"""
    $wmp = New-Object -ComObject WMPlayer.OCX
    $wmp.URL = '{abs_path}'
    $wmp.controls.play()
    while ($wmp.playState -ne 1) {{ Start-Sleep -Milliseconds 200 }}
    """
    return subprocess.Popen(["powershell", "-NoProfile", "-Command", ps_code])

def banner(text: str, color: str = "\033[96m"):
    print(f"\n{color}{'═'*78}\033[0m")
    print(f"{color}  {text}\033[0m")
    print(f"{color}{'═'*78}\033[0m\n")

def main():
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
        
    audio_file = Path("demo/audio/voiceover_full.mp3")
    if not audio_file.exists():
        print("\033[91mError: demo/audio/voiceover_full.mp3 not found!\033[0m")
        sys.exit(1)
        
    print("\033[93m" + "╔" + "═"*76 + "╗")
    print("║   🎬 MERMAIL GRANT MILESTONE DESK — VIDEO RECORDING PROMPTER             ║")
    print("╚" + "═"*76 + "╝\033[0m")
    print("\n\033[97mThis script synchronizes the terminal execution with the narration audio.\033[0m")
    print("1. Launch your screen recorder (\033[92mWin + Alt + R\033[0m or \033[92mOBS Studio\033[0m).")
    print("2. Press \033[93mENTER\033[0m when ready.")
    print("3. After a 5-second countdown, the screen will be cleared and the demo will begin.\n")
    
    try:
        input("\033[92m[Press ENTER when ready to record...] \033[0m")
    except EOFError:
        pass
        
    for i in range(5, 0, -1):
        print(f"\r\033[93mGet ready! Clearing screen and starting demo in {i}... \033[0m", end="", flush=True)
        time.sleep(1.0)
        
    # Clear the entire screen so the recording starts completely clean!
    os.system("cls" if sys.platform == "win32" else "clear")
    
    # Start audio playback in background
    audio_proc = play_audio_powershell(audio_file)
    start_time = time.time()
    
    # -------------------------------------------------------------
    # SECTION 1: Intro & Context (0:00 - 0:30)
    # -------------------------------------------------------------
    banner("WELCOME TO MERMAIL GRANT MILESTONE DESK (AGENT SKILL)", "\033[96m")
    print("\033[97m  Repository:   github.com/Nudgen-Marketing/mermail-skills\033[0m")
    print("\033[97m  Skill Path:   skills/mermail-grant-milestone-desk/\033[0m")
    print("\033[97m  Protocol:     Model Context Protocol (MCP) Streamable HTTP\033[0m")
    print("\033[97m  Settlement:   Solana PayBox Agent Wallet (Multi-Sig & Passkey Tiered)\033[0m")
    print("\033[97m  Ecosystem:    Superteam Earn Bounty Submission\033[0m\n")
    
    print("  \033[90m┌─ Active Standing Grant Policy ───────────────────────────────────────────┐")
    print("  │ Grant ID: grant-sol-mobile-042 | Beneficiary: Superteam Mobile SDK       │")
    print("  │ Total Cap: 5,000.00 USDC       | Authorized Recipient: 8vFtM21...3xKp7L  │")
    print("  └──────────────────────────────────────────────────────────────────────────┘\033[0m\n")
    
    # Wait until 30s mark to align with Section 2 of audio
    while time.time() - start_time < 29.5:
        time.sleep(0.5)
        
    # -------------------------------------------------------------
    # SECTION 2: Scenario 2 - Lockout / Rejection (0:30 - 1:36)
    # -------------------------------------------------------------
    banner("DEMO PART 1: SCENARIO 2 — FAILING PR & PAYBOX FINANCIAL LOCKOUT", "\033[91m")
    subprocess.run([sys.executable, "demo/run_demo.py", "--auto", "--scenario", "2"], check=False)
    
    # Wait until 96s mark to align with Section 3 of audio
    while time.time() - start_time < 95.5:
        time.sleep(0.5)
        
    # -------------------------------------------------------------
    # SECTION 3: Scenario 1 - Approved Milestone & Settlement (1:36 - 2:31)
    # -------------------------------------------------------------
    banner("DEMO PART 2: SCENARIO 1 — COMPLIANT DELIVERY & SOLANA SETTLEMENT", "\033[92m")
    subprocess.run([sys.executable, "demo/run_demo.py", "--auto", "--scenario", "1"], check=False)
    
    # Wait until 151s mark to align with Section 4 of audio
    while time.time() - start_time < 150.5:
        time.sleep(0.5)
        
    # -------------------------------------------------------------
    # SECTION 4: Audit Ledger & Official Test Suite (2:31 - 3:04)
    # -------------------------------------------------------------
    banner("DEMO PART 3: LOCAL AUDIT LEDGER & REPO TEST VERIFICATION", "\033[93m")
    print("\033[96m$ Get-Content demo/receipts/grant-sol-mobile-042-m2.json\033[0m")
    receipt_file = Path("demo/receipts/grant-sol-mobile-042-m2.json")
    if receipt_file.exists():
        print("\033[90m" + receipt_file.read_text(encoding="utf-8") + "\033[0m\n")
    
    time.sleep(2.0)
    print("\033[96m$ node tests/validate.mjs\033[0m")
    subprocess.run(["node", "tests/validate.mjs"], check=False)
    
    # Wait for audio to complete
    while time.time() - start_time < 184.0:
        time.sleep(0.5)
        
    banner("🎉 DEMO COMPLETE! (You can stop the screen recording: Win + Alt + R)", "\033[92m")

if __name__ == "__main__":
    main()
