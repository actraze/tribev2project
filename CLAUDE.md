# TRIBE v2 MLP Training Pipeline — VPS Session Guide

## What This Project Is

A pipeline that predicts Instagram Reel engagement using Meta's TRIBE v2 brain encoder. TRIBE v2 simulates how the human brain processes video/audio/text and outputs a brain activation tensor. We train an MLP on these brain activations (+ CLIP visual embeddings + text embeddings) to predict engagement rate.

## Current State (as of 2026-04-22)

### What's already built (Phase 1 POC — completed on Mac):
- `download_reel.mjs` — downloads a single Instagram Reel via yt-dlp
- `prep_reel.sh` — trims video to 10s (DEPRECATED — Phase 2 uses full video)
- `modal_tribev2.py` — runs TRIBE v2 on Modal A10G GPU, outputs brain tensor (.npz) + transcript
- `extract_features.py` — summarizes brain tensor into per-window stats
- `analyze_reel.py` — sends stats to Kimi K2.6 LLM for text analysis (DEPRECATED — Phase 2 trains an MLP instead)
- `run_poc.sh` / `finish_poc.sh` — master scripts for single-reel POC
- First test run completed on reel `DXasvBOsNcE` (results in `outputs/DXasvBOsNcE/`)

### Known issues from Phase 1 Modal setup:
- **torch version conflict**: TRIBE v2 needs torch<2.7, whisperx needs torch~=2.8. Solution already in `modal_tribev2.py`: pin torch==2.5.1+cu124 via PyTorch CUDA index, install whisperx with `--no-deps`, use PIP_CONSTRAINT to prevent torch upgrades.
- **torchvision binary mismatch**: Must install torchvision==0.20.1 from the same CUDA index as torch.
- **Modal volume double-nesting**: `modal volume get` can double-nest paths. The `finish_poc.sh` script handles this.
- **HuggingFace gating**: LLaMA 3.2 3B requires accepted access request at huggingface.co/meta-llama/Llama-3.2-3B (takes 1-4 hours).

## What Needs to Be Built (Phase 2 — this session)

### VPS Environment Setup (do this first)

This is running on a Hetzner VPS (4 vCPU, 8GB RAM, 160GB disk, Linux).

Install these dependencies:
```bash
# System packages
sudo apt update && sudo apt install -y python3 python3-pip python3-venv ffmpeg git curl

# Node.js (for reel downloader)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# yt-dlp (for downloading reels)
pip3 install yt-dlp

# Modal CLI
pip3 install modal

# Python venv for project
python3 -m venv .venv
source .venv/bin/activate
pip install numpy torch openai anthropic sentence-transformers

# Authenticate Modal (will prompt for token — paste from modal.com dashboard)
python -m modal setup

# Authenticate HuggingFace (paste token from huggingface.co/settings/tokens)
pip install huggingface_hub
huggingface-cli login

# Create Modal secret for HuggingFace
modal secret create huggingface HF_TOKEN=<token>
```

### The 5-Step Pipeline to Build

#### Step 1: Batch Download (`download_batch.mjs`)
- Input: `dataset.csv` with columns: `url,likes,comments,views`
- Downloads each reel via yt-dlp to `reels/<CODE>.mp4` (FULL video, no trim)
- Skips already-downloaded reels
- Outputs `dataset_processed.csv` with added `code` and `engagement_rate` columns
- Engagement rate = (likes + comments) / views

#### Step 2: Batch Modal Processing (`modal_batch.py`)
Based on existing `modal_tribev2.py` but extended. For each reel on Modal A10G GPU:
- **TRIBE v2** brain tensor → `<CODE>/brain.npz` shape `(n_TRs, 20484)`
- **CLIP ViT-L/14** frame embeddings (1 frame per 2s via ffmpeg) → `<CODE>/clip.npz` shape `(n_frames, 768)`
- **sentence-transformers/all-MiniLM-L6-v2** on full transcript → `<CODE>/text.npz` shape `(384,)`

All outputs save to Modal volume `tribev2-outputs`. Process reels sequentially within a single Modal function call to amortize model load time. Send batches of ~50 reels per invocation.

Add to Modal image:
```python
.pip_install("transformers", "sentence-transformers", "Pillow")
```

User has 3 Modal accounts (3x $30 free credit = $90). Split ~500 reels across them (~167 each). Create `run_batch.sh` to coordinate.

**IMPORTANT**: Reuse the torch pinning workaround from existing `modal_tribev2.py`:
```python
.pip_install("torch==2.5.1", "torchvision==0.20.1", index_url="https://download.pytorch.org/whl/cu124")
.run_commands(
    "printf 'torch==2.5.1\\ntorchvision==0.20.1+cu124\\n' > /tmp/c.txt",
    "PIP_CONSTRAINT=/tmp/c.txt pip install ...",
)
```

#### Step 3: Build Dataset (`build_dataset.py`)
Pull outputs from Modal volume, then for each reel:

**Brain features — two strategies:**
- Strategy A (interpretable, 56d): 7 brain regions x 8 stats (mean, max, min, std, first_half_mean, second_half_mean, peak_tr, trend_slope)
- Strategy B (richer, 512d): mean-pool full tensor across time → PCA to 512d

Brain regions (from `extract_features.py`):
- visual_cortex: vertices (0-1200, 10242-11442)
- auditory_cortex: (3500-4200, 13742-14442)
- heschls_gyrus: (3800-4100, 14042-14342)
- brocas_area: (6500-7200, 16742-17442)
- sts: (3200-4500, 13442-14742)
- prefrontal: (7500-9000, 17742-19242)
- motor_cortex: (5500-6500, 15742-16742)

**CLIP features**: mean-pool frame embeddings across time → (768,)
**Text features**: already video-level → (384,)
**Labels**: engagement_rate normalized to [0,1] via log-transform (rates are heavily skewed)
**Splits**: 70/15/15 train/val/test, stratified by engagement quartile

Save as `data/train.pt`, `data/val.pt`, `data/test.pt`

#### Step 4: Train MLP (`train_mlp.py`)

```python
class EngagementMLP(nn.Module):
    def __init__(self, brain_dim, clip_dim=768, text_dim=384):
        self.brain_proj = nn.Sequential(nn.Linear(brain_dim, 256), nn.ReLU(), nn.Dropout(0.3))
        self.clip_proj = nn.Sequential(nn.Linear(clip_dim, 256), nn.ReLU(), nn.Dropout(0.3))
        self.text_proj = nn.Sequential(nn.Linear(text_dim, 128), nn.ReLU(), nn.Dropout(0.3))
        self.head = nn.Sequential(
            nn.Linear(640, 256), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(256, 64), nn.ReLU(),
            nn.Linear(64, 1), nn.Sigmoid())
```

- Loss: MSE | Optimizer: AdamW lr=1e-3 weight_decay=1e-4 | Cosine LR schedule
- 100 epochs, batch_size=32, early stopping patience=15
- Run 3 experiments: brain-only-56d, brain-only-512d, full-multimodal
- Metrics: MSE, MAE, R-squared, Spearman rank correlation
- Trains on CPU (MLP is ~500K params, takes seconds)
- Save best model to `models/best_model.pt`

#### Step 5: Inference (`predict.py`)
Takes a new reel URL → downloads → runs through Modal → loads trained model → outputs predicted engagement rate + brain region breakdown.

### File Structure (target)
```
tribev2project/
├── CLAUDE.md                    # This file
├── PROGRESS.md                  # History / status
├── dataset.csv                  # User provides: url,likes,comments,views
├── download_reel.mjs            # Single reel downloader (Phase 1)
├── download_batch.mjs           # NEW: Batch downloader from CSV
├── modal_tribev2.py             # Phase 1 Modal script (reference)
├── modal_batch.py               # NEW: Batch Modal processing (brain+CLIP+text)
├── run_batch.sh                 # NEW: Launch batch jobs across Modal accounts
├── extract_features.py          # Phase 1 feature extractor (reference)
├── build_dataset.py             # NEW: Aggregate features → train/val/test
├── train_mlp.py                 # NEW: PyTorch MLP training
├── predict.py                   # NEW: Inference on new reels
├── models/                      # Saved model checkpoints
├── data/                        # Processed training data (.pt files)
├── reels/                       # Downloaded videos
├── outputs/<CODE>/              # Per-reel Modal outputs
│   ├── brain.npz                #   (n_TRs, 20484)
│   ├── clip.npz                 #   (n_frames, 768)
│   ├── text.npz                 #   (384,)
│   └── transcripts/<CODE>.json
├── .venv/                       # Python virtual environment
└── tribev2/                     # Cloned Meta repo (reference only)
```

### Execution Order
```bash
# 0. VPS setup (install deps, auth Modal + HF — see above)
# 1. User places dataset.csv in project root
node download_batch.mjs            # downloads all reels
bash run_batch.sh                  # processes all on Modal GPU
python build_dataset.py            # creates train/val/test tensors
python train_mlp.py                # trains + evaluates MLP
python predict.py <NEW_REEL_URL>   # demo inference
```

### Environment Variables Needed
```bash
export MOONSHOT_API_KEY="..."    # Optional, only if using LLM analysis
# Modal and HuggingFace tokens are configured via their respective CLIs
```

## Do Not
- Do not trim videos to 10 seconds — process full length
- Do not use the Kimi/Moonshot LLM for engagement scoring — that's what the MLP replaces
- Do not install torch on the VPS globally — only in .venv (the heavy GPU work runs on Modal)
- Do not store large files in git — add `reels/`, `outputs/`, `.venv/`, `data/`, `models/`, `tribev2/` to .gitignore
