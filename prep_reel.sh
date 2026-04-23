#!/bin/bash
# Trims a reel to 10 seconds
# Usage: ./prep_reel.sh <REEL_CODE>

set -e

CODE="$1"
if [ -z "$CODE" ]; then
  echo "Usage: ./prep_reel.sh <REEL_CODE>"
  exit 1
fi

INPUT="reels/${CODE}.mp4"
OUTPUT="reels/${CODE}-10s.mp4"

if [ ! -f "$INPUT" ]; then
  echo "Error: $INPUT not found"
  exit 1
fi

echo "Trimming $INPUT to 10 seconds..."
ffmpeg -y -i "$INPUT" -t 10 -c:v libx264 -c:a aac -strict experimental "$OUTPUT" 2>/dev/null

echo "Output: $OUTPUT"
