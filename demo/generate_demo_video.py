#!/usr/bin/env python3
"""
Generate a complete, cinematic 1080p demo video for Mermail Security Bounty Desk.
Pipes high-resolution visual frames directly into FFmpeg synchronized with narration audio.
"""

import os
import sys
import subprocess
from PIL import Image, ImageDraw, ImageFont

def get_ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def draw_title_card(width=1920, height=1080, progress=0.0):
    img = Image.new('RGB', (width, height), color=(9, 13, 22))
    draw = ImageDraw.Draw(img)

    # Background subtle radial glow
    for r in range(500, 0, -20):
        alpha = int(35 * (1 - r / 500))
        draw.ellipse([width//2 - r, height//2 - 120 - r, width//2 + r, height//2 - 120 + r],
                     outline=(99, 102, 241, alpha), width=10)

    # Decorative border
    draw.rounded_rectangle([40, 40, width - 40, height - 40], radius=24, outline=(40, 50, 75), width=2)
    draw.rounded_rectangle([50, 50, width - 50, height - 50], radius=20, outline=(255, 255, 255, 15), width=1)

    # Top brand badge
    draw.rounded_rectangle([width//2 - 220, 80, width//2 + 220, 130], radius=25, fill=(18, 24, 38), outline=(99, 102, 241), width=1)
    draw.text((width//2, 105), "MERMAIL AGENT SKILL SHOWCASE", fill=(99, 102, 241), anchor="mm")

    # Main Titles
    draw.text((width//2, height//2 - 140), "Mermail Security Bounty Desk", fill=(255, 255, 255), anchor="mm")
    draw.text((width//2, height//2 - 70), "Autonomous Zero-Trust Vulnerability Triage & Agent Wallet Remittance Desk", fill=(6, 182, 212), anchor="mm")

    # Core Features pill cards
    pills = [
        ("🛡️ Zero-Trust Quarantine", "Isolates adversarial prompt injections in disclosure emails"),
        ("⚡ Policy Verification", "Evaluates CVSS 3.1 & maps severity to protocol bounty caps"),
        ("💰 Agent Wallet (PayBox)", "Real-time treasury solvency check & transfer proposal staging"),
        ("🔐 Human-in-the-Loop", "Protected signing URL handoff — autonomous fund drain impossible"),
        ("✉️ Automated Remittance", "Drafts cryptographic CVE receipts with proposal hash on-chain")
    ]

    card_y = height//2 + 20
    for i, (title, desc) in enumerate(pills):
        cx = 160 + (i % 3) * 540 if i < 3 else 430 + (i - 3) * 540
        cy = card_y if i < 3 else card_y + 140
        draw.rounded_rectangle([cx, cy, cx + 510, cy + 110], radius=14, fill=(18, 24, 38), outline=(40, 50, 75), width=1)
        draw.text((cx + 20, cy + 32), title, fill=(248, 250, 252))
        draw.text((cx + 20, cy + 68), desc, fill=(148, 163, 184))

    # Bottom progress bar
    draw.rectangle([60, height - 60, width - 60, height - 54], fill=(30, 41, 59))
    draw.rectangle([60, height - 60, 60 + int((width - 120) * progress), height - 54], fill=(99, 102, 241))

    return img

def draw_composite_scene(base_img_path, scene_badge, highlight_text, progress=0.0):
    width, height = 1920, 1080
    if os.path.exists(base_img_path):
        base = Image.open(base_img_path).convert('RGB')
        base = base.resize((width, height), Image.Resampling.LANCZOS)
    else:
        base = Image.new('RGB', (width, height), color=(9, 13, 22))

    draw = ImageDraw.Draw(base)

    # Top floating banner overlay
    draw.rounded_rectangle([60, 20, 700, 70], radius=12, fill=(9, 13, 22), outline=(99, 102, 241), width=2)
    draw.text((80, 45), f"▶ {scene_badge.upper()}", fill=(6, 182, 212), anchor="lm")

    # Bottom narration caption overlay
    if highlight_text:
        draw.rounded_rectangle([100, height - 120, width - 100, height - 40], radius=14, fill=(9, 13, 22), outline=(40, 50, 75), width=2)
        draw.text((width//2, height - 80), highlight_text, fill=(248, 250, 252), anchor="mm")

    # Bottom progress bar
    draw.rectangle([60, height - 30, width - 60, height - 26], fill=(30, 41, 59))
    draw.rectangle([60, height - 30, 60 + int((width - 120) * progress), height - 26], fill=(16, 185, 129))

    return base

def draw_summary_card(width=1920, height=1080, progress=1.0):
    img = Image.new('RGB', (width, height), color=(9, 13, 22))
    draw = ImageDraw.Draw(img)

    # Border
    draw.rounded_rectangle([40, 40, width - 40, height - 40], radius=24, outline=(16, 185, 129), width=2)

    # Header
    draw.text((width//2, 100), "SUBMISSION & INTEGRATION SUMMARY", fill=(16, 185, 129), anchor="mm")
    draw.text((width//2, 160), "Mermail Security Bounty Desk (mermail-security-bounty-desk)", fill=(255, 255, 255), anchor="mm")

    # Metrics grid
    metrics = [
        ("Official GitHub PR", "PR #346 on Nudgen-Marketing/mermail-skills"),
        ("Validation Test Suite", "npm test passes 100% (18 skills, 73 business tools)"),
        ("Architecture Pattern", "Zero-Trust Quarantine + Mermail MCP + PayBox HITL"),
        ("Adversarial Defense", "Neutralizes prompt injection payloads in exploit disclosures"),
        ("Treasury Management", "Verified 1,500 USDC Solana reserves & staged 250 USDC cap"),
        ("Bounty Target", "Superteam Earn: Build and Demo a Mermail Agent Skill")
    ]

    for i, (label, val) in enumerate(metrics):
        cx = 240 + (i % 2) * 760
        cy = 240 + (i // 2) * 160
        draw.rounded_rectangle([cx, cy, cx + 680, cy + 120], radius=16, fill=(18, 24, 38), outline=(40, 50, 75), width=1)
        draw.text((cx + 25, cy + 35), label, fill=(148, 163, 184))
        draw.text((cx + 25, cy + 75), val, fill=(248, 250, 252))

    # Footer note
    draw.text((width//2, height - 90), "Built with Antigravity for the Mermail & Superteam Ecosystem", fill=(6, 182, 212), anchor="mm")

    return img

def main():
    ffmpeg_exe = get_ffmpeg()
    audio_path = "/tmp/narration.aiff"
    output_mp4 = "/Users/macbook/Desktop/Mermail_Security_Bounty_Desk_Demo.mp4"
    screen_initial = "/Users/macbook/.gemini/antigravity-ide/scratch/test_screen.png"
    screen_completed = "/Users/macbook/.gemini/antigravity-ide/scratch/demo_completed_scene.png"

    if not os.path.exists(audio_path):
        print(f"Error: audio not found at {audio_path}")
        sys.exit(1)

    fps = 24
    total_seconds = 223.9  # from mdls duration
    total_frames = int(total_seconds * fps)

    print(f"Generating video: {total_seconds:.1f}s, {total_frames} frames @ {fps}fps...")

    cmd = [
        ffmpeg_exe, "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", "1920x1080",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    # Frame generation loop
    for frame_idx in range(total_frames):
        current_time = frame_idx / fps
        progress = frame_idx / total_frames

        # Select scene based on narration timeline
        if current_time < 35.0:
            # Scene 1: Title Card & Intro
            frame = draw_title_card(progress=progress)
        elif current_time < 65.0:
            # Scene 2: Mermail Inbox & Prompt Trigger
            frame = draw_composite_scene(screen_initial, "Scene 1: Prompt Trigger & Mermail Inbox Discovery",
                                         "Agent receives prompt and discovers incoming security disclosure via search_emails", progress=progress)
        elif current_time < 100.0:
            # Scene 3: Zero-Trust Quarantine & Injection Defense
            frame = draw_composite_scene(screen_initial, "Scene 2: Zero-Trust Prompt Injection Quarantine",
                                         "Adversarial payload neutralized! Exploit evaluated to CWE-841 / CVSS 8.2 High (250 USDC Cap)", progress=progress)
        elif current_time < 135.0:
            # Scene 4: MCP Execution Trace & Treasury Verification
            frame = draw_composite_scene(screen_completed, "Scene 3: Agent Wallet Treasury Verification",
                                         "get_agent_wallet_portfolio confirms 1,500 USDC available reserves on Solana Mainnet", progress=progress)
        elif current_time < 170.0:
            # Scene 5: PayBox Transfer Proposal (HITL)
            frame = draw_composite_scene(screen_completed, "Scene 4: PayBox Proposal Staging & Human Handoff",
                                         "create_agent_wallet_transfer_proposal stages 250 USDC reward. Console URL emitted for human signature", progress=progress)
        elif current_time < 205.0:
            # Scene 6: Remittance Receipt & Thread Labeling
            frame = draw_composite_scene(screen_completed, "Scene 5: Remittance Confirmation & Final Result",
                                         "save_draft stages formal CVE acknowledgment. Thread labeled [Bounty-Approved] and closed", progress=progress)
        else:
            # Scene 7: Submission Summary Card
            frame = draw_summary_card(progress=progress)

        proc.stdin.write(frame.tobytes())

        if frame_idx % 240 == 0:
            pct = int(100 * frame_idx / total_frames)
            sys.stdout.write(f"\rProgress: {pct}% ({frame_idx}/{total_frames} frames)...")
            sys.stdout.flush()

    proc.stdin.close()
    proc.wait()

    print(f"\nDone! Video created at: {output_mp4}")
    file_size = os.path.getsize(output_mp4) / (1024 * 1024)
    print(f"File size: {file_size:.2f} MB")

if __name__ == "__main__":
    main()
