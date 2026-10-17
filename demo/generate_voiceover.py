#!/usr/bin/env python3
"""
Generate AI Voiceover using ElevenLabs REST API.
Default Voice: Brian (Voice ID: nPczCjzI2devNBz1zQrb)
Model: eleven_multilingual_v2 / eleven_turbo_v2_5
"""

import os
import sys
import argparse
import requests
from pathlib import Path

# Voice ID for ElevenLabs "Brian" (Deep, authoritative narrator)
BRIAN_VOICE_ID = "nPczCjzI2devNBz1zQrb"
DEFAULT_MODEL_ID = "eleven_turbo_v2_5"

def generate_voiceover(api_key: str, text: str, output_path: Path, voice_id: str = BRIAN_VOICE_ID, model_id: str = DEFAULT_MODEL_ID):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key.strip()
    }
    
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.50,
            "similarity_boost": 0.80,
            "style": 0.0,
            "use_speaker_boost": True
        }
    }
    
    print(f"\033[94mConnecting to ElevenLabs API for Voice ID: {voice_id}...\033[0m")
    response = requests.post(url, json=payload, headers=headers, stream=True)
    
    if response.status_code != 200:
        print(f"\033[91mError: ElevenLabs API returned status code {response.status_code}\033[0m")
        try:
            err_json = response.json()
            print(f"\033[91mDetail: {err_json}\033[0m")
        except Exception:
            print(f"\033[91mRaw: {response.text}\033[0m")
        sys.exit(1)
        
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=4096):
            if chunk:
                f.write(chunk)
                
    size_kb = output_path.stat().st_size / 1024
    print(f"\033[92m✔ Voiceover generated successfully!\033[0m")
    print(f"  Saved to: {output_path.resolve()} ({size_kb:.1f} KB)")

def main():
    parser = argparse.ArgumentParser(description="Generate demo voiceover via ElevenLabs API")
    parser.add_argument("--api-key", default=os.getenv("ELEVENLABS_API_KEY"), help="ElevenLabs API Key")
    parser.add_argument("--voice-id", default=BRIAN_VOICE_ID, help="ElevenLabs Voice ID (default: Brian)")
    parser.add_argument("--script-path", default="demo/voiceover_script.txt", help="Path to narration script")
    parser.add_argument("--output", default="demo/voiceover.mp3", help="Output MP3 path")
    args = parser.parse_args()
    
    script_file = Path(args.script_path)
    if not script_file.exists():
        print(f"\033[91mError: Script file '{script_file}' not found.\033[0m")
        sys.exit(1)
        
    text = script_file.read_text(encoding="utf-8").strip()
    
    api_key = args.api_key
    if not api_key:
        print("\033[93mELEVENLABS_API_KEY is not set.\033[0m")
        api_key = input("Please enter your ElevenLabs API Key: ").strip()
        if not api_key:
            print("\033[91mError: ElevenLabs API Key is required to proceed.\033[0m")
            sys.exit(1)
            
    output_file = Path(args.output)
    generate_voiceover(api_key, text, output_file, voice_id=args.voice_id)

if __name__ == "__main__":
    main()
