#!/bin/bash
# Finish the POC: pull results, extract features, run analysis
# Usage: ./finish_poc.sh <REEL_CODE>

set -e

# Activate venv if available
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
  source "$SCRIPT_DIR/.venv/bin/activate"
fi

CODE="$1"
if [ -z "$CODE" ]; then
  echo "Usage: ./finish_poc.sh <REEL_CODE>"
  exit 1
fi

echo "==========================================="
echo "  TRIBE v2 POC — Finishing Pipeline"
echo "==========================================="
echo "Reel code: $CODE"
echo ""

# Step 1: Pull results from Modal
echo "[1/3] Pulling results from Modal volume..."
mkdir -p "outputs"
modal volume get tribev2-outputs "${CODE}" "./outputs/" --force
echo ""

# Step 2: Extract features
echo "[2/3] Extracting brain activation features..."
python3 extract_features.py "$CODE"
echo ""

# Step 3: Run Kimi K2.6 analysis
echo "[3/3] Running neural engagement analysis (Kimi K2.6)..."
if [ -z "$MOONSHOT_API_KEY" ]; then
  echo "Error: MOONSHOT_API_KEY not set."
  echo "Run: export MOONSHOT_API_KEY=\"your-key-here\""
  exit 1
fi
python3 analyze_reel.py "$CODE"

echo ""
echo "==========================================="
echo "  DONE!"
echo ""
echo "  Results saved to:"
echo "    outputs/${CODE}/raw/${CODE}.npz    — brain tensor"
echo "    outputs/${CODE}/features.json      — extracted features"
echo "    outputs/${CODE}/analysis.txt       — neural breakdown"
echo "==========================================="
