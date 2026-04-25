# TRIBE v2 Neural Diagnosis

Run the full diagnostic pipeline on an Instagram Reel: download → TRIBE v2 on Modal GPU → keyframe extraction → LLM #1 multimodal diagnosis → LLM #2 creator brief.

The user will provide a reel URL as the argument: $ARGUMENTS

## Steps

Execute these steps sequentially. Do NOT ask for confirmation — just run each step and move to the next.

### 1. Extract the reel code

Extract the reel code from the URL. For example, `https://www.instagram.com/reel/ABC123/` → `ABC123`.

### 2. Download the reel

```bash
node download_reel.mjs "$URL"
```

Skip if `reels/<CODE>.mp4` already exists.

### 3. Run TRIBE v2 on Modal

```bash
python -m modal run modal_tribev2.py --reel "reels/<CODE>.mp4"
```

This sends the video to a Modal A10G GPU for brain encoding. Takes 5-15 minutes. Run with `--detach` if the user prefers async.

### 4. Pull results from Modal volume

```bash
mkdir -p outputs
modal volume get tribev2-outputs "<CODE>" "./outputs/" --force
```

Verify `outputs/<CODE>/raw/<CODE>.npz` exists after pulling.

### 5. Extract brain features

```bash
source .venv/bin/activate 2>/dev/null || true
python3 extract_features.py "<CODE>"
```

### 6. Extract keyframes

```bash
python3 extract_frames.py "<CODE>"
```

This runs ffmpeg to extract 1 frame per second at 512px wide into `outputs/<CODE>/frames/`.

### 7. Run LLM #1 — Neural Diagnosis

```bash
python3 diagnose.py "<CODE>"
```

Requires `MOONSHOT_API_KEY` env var. This sends brain data + keyframes + transcript to Kimi K2.6 for a multimodal second-by-second diagnosis. Saves to `outputs/<CODE>/diagnosis.txt`.

### 8. Run LLM #2 — Creator Brief

```bash
python3 chat.py "<CODE>"
```

Takes the diagnosis and produces a creator-friendly executive brief. Saves to `outputs/<CODE>/brief.txt`.

### 9. Show results

Print the contents of `outputs/<CODE>/brief.txt` to the user. Mention that the full neural diagnosis is in `outputs/<CODE>/diagnosis.txt` if they want the detailed breakdown.

## Error handling

- If `MOONSHOT_API_KEY` is not set, tell the user to run `export MOONSHOT_API_KEY="..."` and retry.
- If Modal is not authenticated, tell them to run `python -m modal setup`.
- If download fails, suggest they log into Instagram in Safari first (yt-dlp uses browser cookies as fallback).
- If the Modal step fails with torch errors, check that the image build in `modal_tribev2.py` uses the pinned torch==2.5.1+cu124.
