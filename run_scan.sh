#!/bin/bash
# Runs TRIBE v2 on Modal for a given reel
# Usage: ./run_scan.sh <REEL_CODE>

set -e

CODE="$1"
if [ -z "$CODE" ]; then
  echo "Usage: ./run_scan.sh <REEL_CODE>"
  exit 1
fi

INPUT="reels/${CODE}-10s.mp4"
if [ ! -f "$INPUT" ]; then
  echo "Error: $INPUT not found. Run prep_reel.sh first."
  exit 1
fi

echo "Launching TRIBE v2 on Modal (A10G GPU)..."
echo "Input: $INPUT"
echo ""

modal run --detach modal_tribev2.py --reel "$INPUT"

echo ""
echo "Job submitted! Monitor progress with:"
echo "  modal app logs tribev2-poc"
echo ""
echo "When complete, pull results with:"
echo "  modal volume get tribev2-outputs ${CODE} ./outputs/${CODE}"
