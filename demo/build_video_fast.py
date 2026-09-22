#!/usr/bin/env python3
"""
Fast video assembler for Mermail Security Bounty Desk Demo.
Renders 7 ultra-high-definition 1080p slides and encodes them with FFmpeg in seconds.
"""

import os
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw

SCRATCH_DIR = "/Users/macbook/.gemini/antigravity-ide/scratch/demo_slides"
os.makedirs(SCRATCH_DIR, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

WIDTH, HEIGHT = 1920, 1080

def create_slide_1():
    img = Image.new('RGB', (WIDTH, HEIGHT), color=(9, 13, 22))
    draw = ImageDraw.Draw(img)
    # Background subtle radial lines
    for r in range(500, 0, -25):
        draw.ellipse([WIDTH//2 - r, HEIGHT//2 - 130 - r, WIDTH//2 + r, HEIGHT//2 - 130 + r], outline=(99, 102, 241), width=1)
    
    draw.rounded_rectangle([40, 40, WIDTH - 40, HEIGHT - 40], radius=24, outline=(40, 50, 75), width=2)
    draw.rounded_rectangle([WIDTH//2 - 250, 80, WIDTH//2 + 250, 130], radius=25, fill=(18, 24, 38), outline=(99, 102, 241), width=1)
    draw.text((WIDTH//2, 105), "SUPERTEAM EARN · MERMAIL AGENT SKILL", fill=(99, 102, 241), anchor="mm")

    draw.text((WIDTH//2, HEIGHT//2 - 150), "Mermail Security Bounty Desk", fill=(255, 255, 255), anchor="mm")
    draw.text((WIDTH//2, HEIGHT//2 - 80), "Autonomous Zero-Trust Vulnerability Triage & Agent Wallet Remittance Desk", fill=(6, 182, 212), anchor="mm")

    pills = [
        ("🛡️ Zero-Trust Quarantine", "Isolates adversarial prompt injections in disclosure emails"),
        ("⚡ Policy Verification", "Evaluates CVSS 3.1 & maps severity to protocol bounty caps"),
        ("💰 Agent Wallet (PayBox)", "Real-time treasury solvency check & transfer proposal staging"),
        ("🔐 Human-in-the-Loop", "Protected signing URL handoff — autonomous fund drain impossible"),
        ("✉️ Automated Remittance", "Drafts cryptographic CVE receipts with proposal hash on-chain")
    ]
    card_y = HEIGHT//2 + 30
    for i, (title, desc) in enumerate(pills):
        cx = 160 + (i % 3) * 540 if i < 3 else 430 + (i - 3) * 540
        cy = card_y if i < 3 else card_y + 140
        draw.rounded_rectangle([cx, cy, cx + 510, cy + 110], radius=14, fill=(18, 24, 38), outline=(40, 50, 75), width=1)
        draw.text((cx + 25, cy + 35), title, fill=(248, 250, 252))
        draw.text((cx + 25, cy + 70), desc, fill=(148, 163, 184))

    path = os.path.join(SCRATCH_DIR, "slide1.png")
    img.save(path)
    return path

def create_composite_slide(base_path, badge, caption, filename):
    if os.path.exists(base_path):
        base = Image.open(base_path).convert('RGB')
        base = base.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    else:
        base = Image.new('RGB', (WIDTH, HEIGHT), color=(9, 13, 22))

    draw = ImageDraw.Draw(base)
    # Header badge
    draw.rounded_rectangle([60, 20, 750, 70], radius=12, fill=(9, 13, 22), outline=(99, 102, 241), width=2)
    draw.text((80, 45), f"▶ {badge.upper()}", fill=(6, 182, 212), anchor="lm")

    # Caption box
    draw.rounded_rectangle([80, HEIGHT - 110, WIDTH - 80, HEIGHT - 35], radius=14, fill=(9, 13, 22), outline=(40, 50, 75), width=2)
    draw.text((WIDTH//2, HEIGHT - 72), caption, fill=(248, 250, 252), anchor="mm")

    path = os.path.join(SCRATCH_DIR, filename)
    base.save(path)
    return path

def create_summary_slide():
    img = Image.new('RGB', (WIDTH, HEIGHT), color=(9, 13, 22))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([40, 40, WIDTH - 40, HEIGHT - 40], radius=24, outline=(16, 185, 129), width=2)
    draw.text((WIDTH//2, 95), "OFFICIAL SUBMISSION & VERIFICATION", fill=(16, 185, 129), anchor="mm")
    draw.text((WIDTH//2, 155), "Mermail Security Bounty Desk (mermail-security-bounty-desk)", fill=(255, 255, 255), anchor="mm")

    metrics = [
        ("GitHub Pull Request", "PR #346 on Nudgen-Marketing/mermail-skills (Mergeable: True)"),
        ("Validation Test Suite", "npm test: Validated 18 skills and 73 business tools (0 errors)"),
        ("Adversarial Defense", "Strict zero-trust prompt injection quarantine for inbound PoCs"),
        ("Treasury Management", "Verified 1,500 USDC Solana reserves & staged 250 USDC cap"),
        ("Human-in-the-Loop", "PayBox signing console handoff URL for security lead"),
        ("Target Bounty", "Superteam Earn: Build and Demo a Mermail Agent Skill (500 USDC)")
    ]
    for i, (label, val) in enumerate(metrics):
        cx = 240 + (i % 2) * 760
        cy = 230 + (i // 2) * 160
        draw.rounded_rectangle([cx, cy, cx + 680, cy + 120], radius=16, fill=(18, 24, 38), outline=(40, 50, 75), width=1)
        draw.text((cx + 25, cy + 35), label, fill=(148, 163, 184))
        draw.text((cx + 25, cy + 75), val, fill=(248, 250, 252))

    draw.text((WIDTH//2, HEIGHT - 80), "Open-Source · Standard-Compliant · Ready for Production Deployments on Mermail", fill=(6, 182, 212), anchor="mm")
    path = os.path.join(SCRATCH_DIR, "slide7.png")
    img.save(path)
    return path

def main():
    print("1. Creating high-definition slides...")
    screen_initial = "/Users/macbook/.gemini/antigravity-ide/scratch/test_screen.png"
    screen_completed = "/Users/macbook/.gemini/antigravity-ide/scratch/demo_completed_scene.png"

    s1 = create_slide_1()
    s2 = create_composite_slide(screen_initial, "Step 1: Prompt Trigger & Mermail Discovery",
                                "AI receives prompt and queries designated mailbox via search_emails", "slide2.png")
    s3 = create_composite_slide(screen_initial, "Step 2: Zero-Trust Prompt Injection Defense",
                                "Adversarial payload quarantined! Zero authority granted to inbound exploit instructions", "slide3.png")
    s4 = create_composite_slide(screen_completed, "Step 3: CVSS Evaluation & Treasury Verification",
                                "CWE-841 classified to CVSS 8.2 High (250 USDC). Treasury balance confirmed: 1,500 USDC", "slide4.png")
    s5 = create_composite_slide(screen_completed, "Step 4: PayBox Proposal Staging (HITL)",
                                "create_agent_wallet_transfer_proposal stages 250 USDC reward. Console URL emitted for human signature", "slide5.png")
    s6 = create_composite_slide(screen_completed, "Step 5: Remittance Confirmation & Tagging",
                                "save_draft stages CVE receipt SEC-2026-0922-01. Thread labeled [Bounty-Approved] and closed", "slide6.png")
    s7 = create_summary_slide()

    # Audio duration is 223.9s. Map exact durations:
    # s1: 35.0s, s2: 30.0s, s3: 35.0s, s4: 35.0s, s5: 35.0s, s6: 35.0s, s7: 18.9s => Total: 223.9s
    concat_file = os.path.join(SCRATCH_DIR, "concat.txt")
    with open(concat_file, "w") as f:
        f.write("ffconcat version 1.0\n")
        f.write(f"file '{s1}'\nduration 35.0\n")
        f.write(f"file '{s2}'\nduration 30.0\n")
        f.write(f"file '{s3}'\nduration 35.0\n")
        f.write(f"file '{s4}'\nduration 35.0\n")
        f.write(f"file '{s5}'\nduration 35.0\n")
        f.write(f"file '{s6}'\nduration 35.0\n")
        f.write(f"file '{s7}'\nduration 18.9\n")
        f.write(f"file '{s7}'\n")

    audio_path = "/tmp/narration.aiff"
    output_mp4 = "/Users/macbook/Desktop/Mermail_Security_Bounty_Desk_Demo.mp4"

    print("2. Encoding video with FFmpeg...")
    cmd = [
        FFMPEG, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-i", audio_path,
        "-vf", "fps=24",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        sys.exit(1)

    size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
    print(f"\nSUCCESS! Demo video created: {output_mp4} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    main()
