#!/bin/bash
# Starter template: record + render the 2-5 min Mermail skill demo.
# Copy and modify the label/title line.

LABEL="mermail-spend-audit"
CAST_OUT="$HOME/.tmp/mermail_demo.cast"
GIF_OUT="$HOME/.tmp/mermail_demo.gif"
MP4_OUT="$HOME/.tmp/mermail_demo_final.mp4"

# 1) Interactive recording (manual; finish with ctrl+D when done)
# asciinema rec -t "$LABEL" -i 2 "$CAST_OUT"

# 2) Render gif from cast
# $HOME/.tmp/agg "$CAST_OUT" "$GIF_OUT" --font-size 16 --cols 86 --rows 28

# 3) Convert to mp4 with ffmpeg
# ffmpeg -y -i "$GIF_OUT" -movflags +faststart -pix_fmt yuv420p -vf "scale=1280:-1" "$MP4_OUT"

# 4) Non-interactive alternative (when browser not available):
# run the demo script and splice output into a static-over-text video
# $HOME/mermail-skills-work/demo/run_audit.sh > /tmp/demo_output.txt

echo "Starter recording template — edit LABEL; requires asciinema + agg + ffmpeg (all installed)"
