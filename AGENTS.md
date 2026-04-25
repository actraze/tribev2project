# TRIBE v2 — Single-Reel Neural Diagnostic Tool

## What This Project Is

A pipeline that diagnoses Instagram Reel engagement using Meta's TRIBE v2 brain encoder. Give it any reel URL → it runs the video through a simulated brain → extracts per-second neural activation across 7 brain regions → a multimodal LLM cross-references the brain data with keyframes and transcript to produce a detailed second-by-second engagement breakdown → then you can chat about the results.

**No MLP, no dataset, no training.** The brain data IS the signal. An LLM interprets it.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full pipeline diagram. Summary:

```
Reel URL → Download → TRIBE v2 (Modal GPU) → Keyframe extraction → LLM #1 diagnosis → LLM #2 chat
```

| Step | What | Where | Cost |
|------|------|-------|------|
| 1. Download | yt-dlp → `reels/<CODE>.mp4` (full length) | Local | Free |
| 2. TRIBE v2 | Brain tensor `(n_seconds, 20484)` + transcript | Modal A10G | ~$0.10 |
| 3. Keyframes | 1 JPG per second via ffmpeg | Local | Free |
| 4. LLM #1 | Multimodal diagnosis (brain + frames + transcript) | Kimi K2.6 API | ~$0.03-0.05 |
| 5. LLM #2 | Conversational follow-up on diagnosis | Text LLM | ~$0.01/msg |

**Total: ~$0.15 per reel**

## Current State (as of 2026-04-22)

### What exists (Phase 1 POC):
- `download_reel.mjs` — downloads Instagram Reel via yt-dlp
- `modal_tribev2.py` — runs TRIBE v2 on Modal A10G GPU, outputs brain tensor (.npz) + transcript
- `extract_features.py` — summarizes brain tensor into per-window stats (reference/utility)
- `analyze_reel.py` — sends stats to Kimi K2.6 for text analysis (DEPRECATED — replaced by diagnose.py)
- `prep_reel.sh` — trims video to 10s (DEPRECATED — now process full video)
- `run_poc.sh` / `finish_poc.sh` / `run_scan.sh` — Phase 1 master scripts
- First test run completed on reel `DXasvBOsNcE` (results in `outputs/DXasvBOsNcE/`)

### What needs to be built:
- `extract_frames.py` — ffmpeg keyframe extraction (1 frame/second)
- `diagnose.py` — LLM #1: single multimodal API call with brain data + frames + transcript
- `chat.py` — LLM #2: conversational follow-up using diagnosis as context
- `run_diagnosis.sh` — master script chaining download → Modal → frames → diagnose

### Known issues from Phase 1 Modal setup:
- **torch version conflict**: TRIBE v2 needs torch<2.7, whisperx needs torch~=2.8. Solution in `modal_tribev2.py`: pin torch==2.5.1+cu124 via PyTorch CUDA index, install whisperx with `--no-deps`, use PIP_CONSTRAINT to prevent torch upgrades.
- **torchvision binary mismatch**: Must install torchvision==0.20.1 from the same CUDA index as torch.
- **Modal volume double-nesting**: `modal volume get` can double-nest paths. The `finish_poc.sh` script handles this.
- **HuggingFace gating**: LLaMA 3.2 3B requires accepted access request at huggingface.co/meta-llama/Llama-3.2-3B.

## Brain Regions (fsaverage5 atlas)

| Region | Vertices (LH, RH offset +10242) | What it signals |
|--------|----------------------------------|-----------------|
| Visual cortex | 0-1200, 10242-11442 | Visual processing intensity |
| Auditory cortex | 3500-4200, 13742-14442 | Sound/music processing |
| Heschl's gyrus | 3800-4100, 14042-14342 | Speech perception |
| Broca's area | 6500-7200, 16742-17442 | Language comprehension |
| STS | 3200-4500, 13442-14742 | Social cognition, face processing |
| Prefrontal | 7500-9000, 17742-19242 | Attention, decision-making |
| Motor cortex | 5500-6500, 15742-16742 | Action/movement response |

## LLM #1 Diagnosis — What It Receives

For a 30-second video (~88K tokens total):
- **30 keyframe images** (1/second): ~85K tokens
- **Brain data** (15 windows x 7 regions with activation levels): ~3K tokens
- **Full transcript** with word-level timestamps: ~200 tokens

Kimi K2.6 context window is 128K tokens — fits with room for output.

The LLM outputs a second-by-second breakdown explaining WHY each moment works or doesn't, by cross-referencing what's visually on screen, which brain regions responded, and what was being said.

## File Structure

```
tribev2project/
├── AGENTS.md                    # This file
├── ARCHITECTURE.md              # Pipeline diagram and design rationale
├── PROGRESS.md                  # History of completed work
├── download_reel.mjs            # Download reel via yt-dlp
├── modal_tribev2.py             # TRIBE v2 on Modal GPU
├── extract_features.py          # Brain tensor → per-window stats (utility)
├── extract_frames.py            # TODO: ffmpeg keyframe extraction
├── diagnose.py                  # TODO: LLM #1 multimodal diagnosis
├── chat.py                      # TODO: LLM #2 conversational follow-up
├── run_diagnosis.sh             # TODO: Master script (download → Modal → frames → diagnose)
├── analyze_reel.py              # DEPRECATED (Phase 1 LLM analysis)
├── prep_reel.sh                 # DEPRECATED (10s trim)
├── run_poc.sh / finish_poc.sh   # Phase 1 master scripts
├── reels/<CODE>.mp4             # Downloaded videos
├── outputs/<CODE>/
│   ├── brain.npz                #   (n_TRs, 20484)
│   ├── transcripts/<CODE>.json  #   Word-level timestamps
│   ├── frames/                  #   Keyframe JPGs (1/second)
│   └── diagnosis.txt            #   LLM #1 output
├── .venv/                       # Python virtual environment
└── tribev2/                     # Cloned Meta repo (reference only)
```

## Usage (once built)

```bash
# Process a reel end-to-end
./run_diagnosis.sh https://www.instagram.com/reel/XXXX/

# Chat about the results
python chat.py XXXX
```

## Environment Variables

```bash
export MOONSHOT_API_KEY="..."    # Required for Kimi K2.6 (LLM #1 diagnosis)
# Modal and HuggingFace tokens configured via their respective CLIs
```

## Do Not

- Do not trim videos — process full length
- Do not train an MLP or build a dataset — the brain data is interpreted directly by the LLM
- Do not store large files in git — `reels/`, `outputs/`, `.venv/`, `data/`, `models/`, `tribev2/` are gitignored
