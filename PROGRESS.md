# TRIBE v2 POC — Progress Report

## Status: FIRST RUN COMPLETE — PLANNING MLP ARCHITECTURE

## Completed

### Phase 1: Environment Setup
- Cloned `facebookresearch/tribev2` repo
- Installed: modal, huggingface_hub, numpy, openai, yt-dlp
- ffmpeg already present via Homebrew
- Node.js v24.2.0 confirmed
- **HuggingFace**: logged in (token saved to `~/.cache/huggingface/token`)
- **Modal**: authenticated, workspace `zaiid-ghanimm`, token saved to `~/.modal.toml`
- **Modal secret**: `huggingface` secret created with HF_TOKEN

### Phase 2: Download & Prep Scripts
- `download_reel.mjs` — downloads Instagram Reel via yt-dlp (falls back to Safari cookies)
- `prep_reel.sh` — trims video to 10 seconds with ffmpeg

### Phase 3: Modal GPU Script
- `modal_tribev2.py` — runs TRIBE v2 on Modal A10G GPU, saves brain tensor (.npz) + transcript to `tribev2-outputs` volume
- `run_scan.sh` — launches the Modal job with `--detach`
- **Fixed dependency conflicts**: torchvision/torch binary mismatch, whisperx torch~=2.8 vs tribev2 torch<2.7 conflict. Solution: pin torch==2.5.1+cu124 via PyTorch CUDA index, install whisperx with `--no-deps`, constrain torch via PIP_CONSTRAINT to prevent upgrades.

### Phase 4: Feature Extraction
- `extract_features.py` — loads .npz tensor (n_TRs, 20484), slices into 2s windows, computes per-window metrics (mean/max activation, fire vertices, dominant brain region), overall trend, peak timestamp, region breakdown. Aligns transcript words to windows.

### Phase 5: Kimi K2.6 Analysis
- `analyze_reel.py` — sends features.json to Moonshot API (kimi-k2.6 model) via OpenAI-compatible SDK. Prompts for second-by-second neural breakdown, strongest/weakest moments, 3 recommendations, and 1-10 engagement score.

### Phase 6: Master Scripts
- `run_poc.sh <URL>` — chains download → trim → Modal launch
- `finish_poc.sh <CODE>` — chains Modal pull → feature extraction → Kimi analysis
- **Fixed**: `finish_poc.sh` now activates `.venv` and fixes Modal volume double-nesting issue

### Phase 7: First Test Run (2026-04-22)
- **Reel tested**: `DXasvBOsNcE` (118.5s full length, 140k likes)
- Only first 10 seconds were analyzed (8.4% of the video)
- TRIBE v2 output: tensor (10, 20484), 23 transcript words, 10 segments
- Kimi scored it 4/10 — but this is misleading due to the 10s trim on a 2-minute video
- Results saved to `outputs/DXasvBOsNcE/`
- Python venv created at `.venv/` with numpy and openai installed

## Known Gaps Identified

### Gap 1: Only 10 seconds processed
- `prep_reel.sh` trims to 10s — need to process full video for meaningful analysis
- Full reel is 118.5s; analyzing 8.4% gives incomplete picture

### Gap 2: LLM has no visual information
- The LLM never sees any frames from the video
- It only receives: brain activation stats + transcript words + region labels
- When it makes visual recommendations ("add face shot", "reaction shot"), it's hallucinating — it has no idea what's on screen
- Needs: keyframe extraction per time window, sent as images to a multimodal LLM

### Gap 3: No trained engagement model
- The "neural engagement score" (4/10) is an LLM opinion, not a computed metric
- No MLP or learned layer exists — it's raw tensor → hand-crafted summary stats → LLM prompt
- Need ground truth labels (likes, watch-through rate, saves) to train a real predictor

## Next Session: MLP Architecture Design

The goal is to build a proper engagement prediction model. Key design questions to resolve:

### Alignment Strategy
- **Time is the join key** — brain data, transcript, and frames all have timestamps
- Pick a window size (1s or 2s), then for each window bundle:
  - Brain activation vector (20,484 vertices for that TR)
  - Frame(s) extracted at window midpoint → CLIP embedding (512d)
  - Transcript words in that window → text embedding (768d)

### Proposed MLP Input
```
Per-moment input: [brain_vector (20484,) | CLIP_embedding (512,) | text_embedding (768,)]
  → concatenate → MLP layers → engagement_score (1,)
```

### Open Questions
1. Window size: 1s (precise but noisy) vs 2s (smoother brain data)?
2. Frame selection: single keyframe per window or average CLIP embeddings?
3. Training labels: what engagement metric to predict (likes, saves, watch-through)?
4. Should the MLP predict per-window engagement or overall video score?
5. How much training data (reels) is needed?
6. Should we also enrich the LLM prompt with frames first (quick win) before training the MLP?

## Before Running

1. **Set Moonshot API key**: `export MOONSHOT_API_KEY="your-key-here"`
2. **Have a Reel URL ready**

## How to Run

```bash
./run_poc.sh https://www.instagram.com/reel/XXXX/
# wait ~12-20 minutes
./finish_poc.sh XXXX
```

## File Structure

```
tribev2project/
├── .venv/                   # Python virtual env (numpy, openai)
├── tribev2/                  # cloned Meta repo
├── reels/                    # downloaded + trimmed videos
├── outputs/                  # per-reel results
│   └── <CODE>/
│       ├── raw/<CODE>.npz
│       ├── transcripts/<CODE>.json
│       ├── segments.json
│       ├── features.json
│       └── analysis.txt
├── download_reel.mjs
├── prep_reel.sh
├── modal_tribev2.py
├── run_scan.sh
├── extract_features.py
├── analyze_reel.py
├── run_poc.sh
└── finish_poc.sh
```

## Notes
- The Modal script installs tribev2 from git inside the container image — first run will be slower while it builds
- Brain region vertex mappings in extract_features.py are approximate (fsaverage5 atlas)
- Modal free tier gives $30 credit; each reel costs ~$0.07-0.15 depending on video length
- OpenAI SDK is used only as an HTTP client for Moonshot's OpenAI-compatible API
- Moonshot API key is set via env var, not hardcoded
