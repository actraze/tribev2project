# TRIBE v2 — Revised Architecture (No MLP)

## Overview

Single-reel diagnostic tool. No training, no dataset, no MLP. Process any video → get a full neural engagement breakdown → chat about the results.

## Pipeline

```
Instagram Reel URL
        │
   ┌────▼─────────┐
   │ 1. DOWNLOAD   │  yt-dlp → reels/<CODE>.mp4 (full length, no trim)
   └────┬──────────┘
        │
   ┌────▼──────────────┐
   │ 2. TRIBE v2       │  Modal A10G GPU (~$0.10/reel)
   │    (Modal)        │  → brain.npz (n_seconds, 20484 cortical vertices)
   │                   │  → transcript with word-level timestamps
   └────┬──────────────┘
        │
   ┌────▼──────────────┐
   │ 3. KEYFRAMES      │  ffmpeg: 1 frame per second
   │    (local)        │  → frames/<CODE>/frame_001.jpg, frame_002.jpg, ...
   └────┬──────────────┘
        │
   ┌────▼──────────────┐
   │ 4. LLM #1         │  Single multimodal API call (~88K tokens for 30s video)
   │    (Kimi K2.6)    │  Receives:
   │                   │    • Per-second brain activation × 7 regions
   │                   │    • 1 keyframe per second (images)
   │                   │    • Full transcript with timestamps
   │                   │  Outputs:
   │                   │    • Comprehensive second-by-second diagnosis
   │                   │    • Which moments work, which don't, and why
   │                   │    • Saves to outputs/<CODE>/diagnosis.txt
   └────┬──────────────┘
        │
   ┌────▼──────────────┐
   │ 5. LLM #2         │  Text-only, multi-turn conversation
   │  (Conversational) │  Receives: diagnosis.txt as system context
   │                   │  User can ask follow-up questions:
   │                   │    "Why does attention drop at second 8?"
   │                   │    "What should I change in the hook?"
   │                   │    "Compare the first 5s vs last 5s"
   └───────────────────┘
```

## What Each Component Does

| Component | Input | Output | Cost |
|-----------|-------|--------|------|
| TRIBE v2 | Video file | Brain activation tensor (n_TRs, 20484) + transcript | ~$0.10/reel |
| Keyframes | Video file | 1 JPG per second | Free (local ffmpeg) |
| LLM #1 | Brain data + frames + transcript | Full text diagnosis | ~$0.03-0.05/call |
| LLM #2 | Diagnosis text + user questions | Conversational answers | ~$0.01/message |

**Total cost per reel: ~$0.15**

## Why No MLP

- The MLP only outputs a single engagement score — one number
- Training it requires processing ~500 reels on Modal GPUs (~20 hours, ~$90)
- TRIBE v2's brain data already provides per-second engagement signals directly
- The per-second diagnosis is what companies actually pay for, not a vanity score
- Can always add MLP later as a "batch scoring" feature

## Brain Regions (from TRIBE v2 fsaverage5 atlas)

| Region | What it signals |
|--------|----------------|
| Prefrontal | Attention, decision-making |
| STS (superior temporal sulcus) | Social cognition, face processing |
| Visual cortex | Visual processing intensity |
| Auditory cortex | Sound/music processing |
| Heschl's gyrus | Speech perception |
| Broca's area | Language comprehension |
| Motor cortex | Action/movement response |

## Token Budget (30s video)

- 30 keyframe images: ~85K tokens
- Brain data (15 windows × 7 regions): ~3K tokens
- Transcript (~75 words): ~200 tokens
- **Total input: ~88K tokens**
- Kimi K2.6 context window: 128K tokens → fits with room for output

## Files

```
tribev2project/
├── download_reel.mjs        # Download reel via yt-dlp
├── modal_tribev2.py         # TRIBE v2 on Modal GPU
├── extract_frames.py        # NEW: ffmpeg keyframe extraction
├── diagnose.py              # NEW: LLM #1 — single multimodal call
├── chat.py                  # NEW: LLM #2 — conversational follow-up
├── run_diagnosis.sh         # NEW: Master script chaining steps 1-4
├── reels/<CODE>.mp4         # Downloaded videos
├── outputs/<CODE>/
│   ├── brain.npz            # Brain tensor
│   ├── transcripts/<CODE>.json
│   ├── frames/              # Keyframe JPGs
│   └── diagnosis.txt        # LLM #1 output
└── modal_tribev2.py         # Existing Modal script
```

## Usage

```bash
# Process a reel end-to-end
./run_diagnosis.sh https://www.instagram.com/reel/XXXX/

# Chat about the results
python chat.py XXXX
```
