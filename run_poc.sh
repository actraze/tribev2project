#!/bin/bash
# Master script: download, prep, and launch TRIBE v2 scan
# Usage: ./run_poc.sh <INSTAGRAM_REEL_URL>

set -e

URL="$1"
if [ -z "$URL" ]; then
  echo "Usage: ./run_poc.sh <INSTAGRAM_REEL_URL>"
  exit 1
fi

# Extract reel code from URL
CODE=$(echo "$URL" | grep -oP '(?<=/reel/)[A-Za-z0-9_-]+' 2>/dev/null || echo "$URL" | sed -n 's|.*/reel/\([A-Za-z0-9_-]*\).*|\1|p')
if [ -z "$CODE" ]; then
  echo "Error: Could not extract reel code from URL"
  exit 1
fi

echo "==========================================="
echo "  TRIBE v2 POC Pipeline"
echo "==========================================="
echo "Reel code: $CODE"
echo "URL: $URL"
echo ""

# Step 1: Download
echo "[1/3] Downloading reel..."
node download_reel.mjs "$URL"
echo ""

# Step 2: Trim to 10s
echo "[2/3] Trimming to 10 seconds..."
bash prep_reel.sh "$CODE"
echo ""

# Step 3: Launch TRIBE v2 on Modal
echo "[3/3] Launching TRIBE v2 on Modal..."
bash run_scan.sh "$CODE"

echo ""
echo "==========================================="
echo "  TRIBE v2 processing on Modal GPU..."
echo "  This takes ~12 minutes."
echo ""
echo "  Monitor: modal app logs tribev2-poc"
echo ""
echo "  When done, run:"
echo "    ./finish_poc.sh $CODE"
echo "==========================================="
