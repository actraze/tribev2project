#!/bin/bash
# Full diagnostic pipeline: download → Modal → frames → LLM #1 → LLM #2
# Usage: ./run_diagnosis.sh <REEL_URL>

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
    source "$SCRIPT_DIR/.venv/bin/activate"
fi

URL="$1"
if [ -z "$URL" ]; then
    echo "Usage: ./run_diagnosis.sh <REEL_URL>"
    exit 1
fi

# Extract reel code from URL
CODE=$(echo "$URL" | sed 's|.*/reel/||' | sed 's|[/?].*||')
if [ -z "$CODE" ]; then
    echo "Error: Could not extract reel code from URL: $URL"
    exit 1
fi

echo "==========================================="
echo "  TRIBE v2 Neural Diagnosis Pipeline"
echo "==========================================="
echo "  Reel: $CODE"
echo "  URL:  $URL"
echo ""

# Step 1: Download
echo "[1/6] Downloading reel..."
if [ -f "reels/${CODE}.mp4" ]; then
    echo "  Already downloaded, skipping."
else
    node download_reel.mjs "$URL"
fi
echo ""

# Step 2: Modal TRIBE v2 processing
echo "[2/6] Running TRIBE v2 on Modal GPU..."
python -m modal run modal_tribev2.py --reel "reels/${CODE}.mp4"
echo ""

# Step 3: Pull results from Modal volume
echo "[3/6] Pulling results from Modal volume..."
mkdir -p outputs
modal volume get tribev2-outputs "${CODE}" "./outputs/" --force
echo ""

# Step 4: Extract features
echo "[4/6] Extracting brain features..."
python3 extract_features.py "$CODE"
echo ""

# Step 5: Extract keyframes
echo "[5/6] Extracting keyframes from video..."
python3 extract_frames.py "$CODE"
echo ""

# Step 6: LLM diagnosis pipeline
if [ -z "$MOONSHOT_API_KEY" ]; then
    echo "Error: MOONSHOT_API_KEY not set."
    echo '  export MOONSHOT_API_KEY="your-key-here"'
    exit 1
fi

echo "[6/6] Running LLM #1 (multimodal diagnosis)..."
python3 diagnose.py "$CODE"
echo ""

echo "Running LLM #2 (creator brief)..."
python3 chat.py "$CODE"
echo ""

echo "==========================================="
echo "  DONE!"
echo ""
echo "  Results in outputs/${CODE}/:"
echo "    raw/${CODE}.npz        — brain tensor"
echo "    transcripts/${CODE}.json — transcript"
echo "    features.json          — extracted features"
echo "    frames/                — keyframes (1/sec)"
echo "    diagnosis.txt          — LLM #1 neural diagnosis"
echo "    brief.txt              — LLM #2 creator brief"
echo "==========================================="
