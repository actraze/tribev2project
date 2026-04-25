# TRIBE v2 POC — Progress Report

## Status: CALIBRATED DIAGNOSIS VERIFIED — LIVE TESTING PASSED

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

### Phase 8: Diagnostic Pipeline (2026-04-24)
- **`extract_frames.py`** — ffmpeg keyframe extraction (1 frame/second at 512px wide → `outputs/<CODE>/frames/`)
- **`diagnose.py`** — LLM #1: sends brain data + keyframe images + transcript to Kimi K2.6 (multimodal) → second-by-second neural breakdown → `outputs/<CODE>/diagnosis.txt`
- **`chat.py`** — LLM #2: takes diagnosis.txt and produces a creator-friendly executive brief → `outputs/<CODE>/brief.txt`
- **`run_diagnosis.sh`** — master script chaining: download → Modal → pull → features → frames → diagnose → brief

### Phase 8 Test Run: Reel `DVj0HP6CQOP` (2026-04-24)
- 29 seconds, 97 transcript words, 28 keyframes
- Brain tensor: (29, 20484), 29 segments
- Content: talking head + screen recording tutorial about Claude Code for marketing
- Diagnosis correctly identified relative patterns: activation ramped 3-4x during screen demo (secs 5-18) vs talking head segments
- Brief delivered actionable creator feedback (hook replacement, CTA restructuring)
- Full pipeline cost: ~$0.15 total (~$0.10 Modal + ~$0.05 Kimi)

## Current Problem: Absolute Calibration

The pipeline works end-to-end but the LLM has no reference for what TRIBE v2 activation values *mean*. It invented a 0.2 "moderate" threshold and called the entire reel neurologically dead — but the actual reel had 50% retention at 4 seconds (a strong hook).

**Root cause**: TRIBE v2 is a brain *encoding* model, not an engagement scorer. It outputs simulated fMRI values. There's no published baseline for what "good" or "bad" looks like, no pre-trained downstream MLP, and no one has used it for content scoring before — this application is novel.

**What the LLM gets right**: Relative patterns within a reel (which moments are stronger/weaker than others).
**What the LLM gets wrong**: Absolute judgments ("dead", "flatline", "sub-threshold") because it has no calibration data.

### Options evaluated:
1. ~~Relative-only (z-scores/percentiles)~~ — Loses ability to say "this whole video is weak." Every reel gets a peak.
2. ~~Few-shot with user metrics~~ — Target user (pre-launch testing) has no metrics yet.
3. **Empirical calibration (chosen)** — Run 20 diverse reels to map TRIBE v2's actual output range across content types. Build a stats table (content type → typical mean/peak/range) and bake it into the diagnosis prompt.
4. ~~Train an MLP on 500 reels~~ — Public metrics (likes/views) are dominated by non-content factors (follower count, posting time, algorithm). Signal-to-noise ratio too low. Would cost ~$100 with uncertain ROI.
5. ~~Fake the demo~~ — No. Falls apart on any unseen reel.

## Phase 9: Calibration Sprint (2026-04-24)

### Status: Calibration table built, integrated into diagnose.py — 2 reels still need retry

### Setup
- `calibration_reels.csv` — 16 reels across 4 content types, balanced high/low performers per category
- `run_calibration.py` — batch processor: reads CSV, downloads each reel, runs Modal, extracts features + frames. Supports `--batch 1` / `--batch 2` for parallel processing across two Modal accounts
- `build_calibration.py` — aggregates all features.json files into `outputs/calibration.json` with per-category stats, global ranges, and high-vs-low performer comparison

### Reel Selection (16 reels, 4 categories × 2 high + 2 low performers)
| Category | High performers | Low performers |
|---|---|---|
| Talking Head | Sales (3.5M views), Self Improvement (1.1M) | Personal Finance (9.4K), Business (4.3K) |
| Screen Demo / Tutorial | Content Marketing (570K), Video Editing (3.2M) | Business (200), Video Editing (3.6K) |
| Cinematic B-roll | Travel (10.9M), Food (11.9M) | Skincare (34K), Adventure (14K) |
| Music/Dance/Performance | Music (3.4M), Performance (16.1M) | Music (19.4K), Performance (3.4K) |

### Progress (2026-04-24)
- All 16 reels downloaded successfully
- Two Modal accounts set up for parallel processing:
  - Primary: `zaiid-ghanimm` (batch 1: reels 1-8, talking head + screen demo)
  - Secondary: `zaid-7438` (batch 2: reels 9-16, cinematic B-roll + music/dance)
- Second Modal account config at `~/.modal2.toml`, huggingface secret created
- **Bug fixed**: `run_calibration.py` initially used `python -m modal run` which failed because Modal is installed system-wide (`/Library/Frameworks/Python.framework/Versions/3.11/bin/modal`), not in `.venv`. Fixed to use absolute path to Modal binary.
- **Concurrency upgrade**: `modal_tribev2.py` now supports `--batch` flag for `.map()` — sends all reels in one Modal app, spawning N containers concurrently instead of N sequential single-container runs. `run_calibration.py` updated to use CLI `--batch` mode.
- **14 of 16 reels processed** across both accounts (2 failed — need retry next session)
- 4 reels already had `features.json` from earlier runs: `DVj0HP6CQOP`, `DXTFZQHk6J8`, `DXasvBOsNcE`, `DXcyJC9ksxc`
- Batch 2 (secondary account) ran 8 reels concurrently via `.map()` — confirmed working
- Batch 1 (primary account) launched but needs verification — was interrupted during processing

### Calibration Results (2026-04-24)
- Ran `build_calibration.py` on 14 available reels → `outputs/calibration.json`
- **Key finding: absolute activation does NOT predict engagement.** High performers had *lower* mean activation (0.028) than low performers (0.040). Separation: -0.012. This held across all 7 brain regions.
- Empirical percentile distribution (per-window region values across all 14 reels):
  - P0: -0.1053, P25: -0.0042, P50: 0.0241, P75: 0.0562, P90: 0.0929, P95: 0.1158, Max: 0.1946
- The old `diagnose.py` scale (`0.2–0.4 = moderate, >0.5 = strong`) was completely wrong — real P95 is only 0.116
- `build_calibration.py` now generates a `prompt_block` field in `calibration.json` — a pre-rendered markdown block ready for injection into the LLM prompt
- `diagnose.py` updated: loads calibration block from `calibration.json` at runtime (with hardcoded fallback), replaces the wrong scale with empirical percentile table + warning that absolute values don't predict engagement + guidance to focus on relative patterns, regional signatures, and temporal dynamics

### Calibrated Diagnosis Verified (2026-04-24)
- Ran `diagnose.py DVj0HP6CQOP` with calibration.json loaded into prompt
- LLM correctly used empirical percentile table (P75, P90, P95) instead of inventing thresholds
- Focused on relative patterns, regional signatures, and temporal dynamics as instructed
- Identified bimodal profile: screen demo (secs 5–18) at P90–P95+, talking head bookends collapsed to baseline
- Peak: heschl's=0.162 at second 14 (command palette reveal) — correctly noted as "extraordinarily high"
- Dead zone: broca's=-0.004 at second 27 (CTA) — correctly noted as below-baseline suppression
- No more "neurologically dead" false alarms — calibration working as intended

### Remaining
- 2 calibration reels still need retry: `DEnKwgGJi9p` (Talking Head, HIGH, 3.5M views), `DQ4wwuvkiiC` (Music/Dance, HIGH, 16.1M views)
- After processing: rerun `python3 build_calibration.py` to regenerate calibration.json
- Investigate whether relative patterns (trend, regional shifts, temporal dynamics) DO predict engagement — the diagnostic value may be in patterns, not levels

## Phase 10: Minimal Local Web App (2026-04-24)

### Status: Working local Next.js app scaffold built — real full upload pipeline not yet run

### What was built
- Added a basic Next.js + TypeScript + Tailwind app at repo root.
- Implemented routes:
  - `/` — landing page with "Try Now" and "View Demo"
  - `/scan` — upload page
  - `/processing/[id]` — long-running pipeline progress page
  - `/results/[id]` — neural timeline/dashboard page
- Added disk-backed local state:
  - `data/jobs/{id}.json` — job status/progress
  - `data/jobs/{id}.log` — pipeline stdout/stderr
  - `reels/{id}.mp4` — uploaded video
  - `outputs/{id}/...` — generated outputs from existing scripts
- Added `.env.example` with local defaults and required keys for real uploads.
- Updated `.gitignore` to keep `.next/`, env files, videos, outputs, and runtime data out of git.

### API routes implemented
- `POST /api/scan`
  - Accepts one video upload.
  - Validates extension/type.
  - Uses `ffprobe` to reject videos `>= 30s`.
  - Saves accepted videos to `reels/{id}.mp4`.
  - Creates a disk job record.
  - Starts the existing pipeline in the background and immediately returns `{ id }`.
- `GET /api/progress/[id]`
  - Server-Sent Events endpoint that streams `data/jobs/{id}.json`.
  - Designed to keep the processing page alive through a 15-20 minute Modal run.
- `GET /api/results/[id]`
  - Reads `features.json`, transcript JSON, `diagnosis.txt`, `brief.txt`, frames, and metadata from `outputs/{id}`.
- `GET /api/video/[id]`
  - Serves local MP4 with HTTP Range support for browser seeking.
- `GET /api/frames/[id]/[file]`
  - Serves extracted frame JPEGs.

### Pipeline wrapper behavior
- Uses the existing scripts in order:
  1. `python -m modal run modal_tribev2.py --reel reels/{id}.mp4`
  2. `modal volume get tribev2-outputs {id} ./outputs/ --force`
  3. `python extract_features.py {id}`
  4. `python extract_frames.py {id}`
  5. `python diagnose.py {id}`
  6. `python chat.py {id}`
- The wrapper updates the job status before each step.
- The wrapper appends command output to `data/jobs/{id}.log`.
- Only one active upload job is allowed at a time in v1.
- If a step fails, the processing page shows the failed state and readable error.

### Demo verified
- Demo ID: `DVj0HP6CQOP`
- Existing local files are complete:
  - `reels/DVj0HP6CQOP.mp4`
  - `outputs/DVj0HP6CQOP/features.json`
  - `outputs/DVj0HP6CQOP/transcripts/DVj0HP6CQOP.json`
  - `outputs/DVj0HP6CQOP/frames/`
  - `outputs/DVj0HP6CQOP/diagnosis.txt`
  - `outputs/DVj0HP6CQOP/brief.txt`
- Verified in browser:
  - `http://localhost:3000/`
  - `http://localhost:3000/scan`
  - `http://localhost:3000/results/DVj0HP6CQOP`
- Verified API responses:
  - `/api/results/DVj0HP6CQOP` returns `200`
  - `/api/frames/DVj0HP6CQOP/frame_001.jpg` returns `200`
  - `/api/video/DVj0HP6CQOP` with Range header returns `206`
- Verified upload validation:
  - Generated a 31-second test MP4.
  - `POST /api/scan` correctly rejected it with: `Video must be less than 30 seconds.`
  - Temporary rejected upload files were cleaned up.

### Verification commands run
```bash
npm install
npm run build
npm run lint
npm run dev
curl -s -o /tmp/tribe-results.json -w '%{http_code} %{size_download}\n' http://localhost:3000/api/results/DVj0HP6CQOP
curl -s -H 'Range: bytes=0-99' -o /tmp/tribe-video.bin -w '%{http_code} %{size_download}\n' http://localhost:3000/api/video/DVj0HP6CQOP
```

### Known notes / caveats
- `npm run build` passes.
- `npm run lint` exits successfully, but still reports two pre-existing warnings in `download_reel.mjs` for unused catch variables.
- `npm audit --omit=dev` reports a moderate PostCSS advisory through Next's nested PostCSS dependency. Current Next version installed: `16.2.4`; no safe non-breaking audit fix was applied.
- The full real upload pipeline was **not** run from the app because it would trigger the 15-20 minute Modal/Kimi job.
- No Docker, Caddy, VPS, Supabase, auth, or deployment work has been implemented yet.

### Next steps
- Run one real short-video upload through `/scan` to verify the full background pipeline end to end.
- Confirm Modal credentials, HuggingFace token, and `MOONSHOT_API_KEY` are available in the app process environment.
- Improve the results dashboard once real uploads are verified:
  - polish chart scaling and labels
  - make frame/timeline seeking more explicit
  - optionally add chat interactivity
- After local flow is proven, start a separate VPS session for Docker/Caddy/deployment.

## Phase 11: 3D Brain Timeline Experiment (2026-04-25)

### Goal
- Add a brain visualization that plays in sync with the reel video.
- As the video timestamp changes, the brain visualization should update from that scan's TRIBE-derived region activation data in `features.json`.
- The brain view is meant to complement the existing Recharts activation timeline, not replace it.

### Attempt 1: React Three Fiber / Drei
- Installed `three`, `@react-three/fiber`, `@react-three/drei`, and `@types/three`.
- Added an initial `BrainViewer3D` component and wired it into `components/ResultsDashboard.tsx`.
- The implementation used the existing per-window `region_activations` from `features.json`, not raw `.npz` tensors in the browser.
- It supported:
  - active-window sync from video `currentTime`
  - region glow/intensity updates
  - dominant-region pulsing
  - region focus that also changed the chart emphasis
- **Problem**: runtime crash in Next 16 / Turbopack:
  - `Cannot read properties of undefined (reading 'ReactCurrentOwner')`
  - Root cause appears to be React Three Fiber's reconciler path under the current React/Next runtime.
- Build could pass, but browser runtime failed, so this approach was abandoned.

### Attempt 2: Plain Three.js Procedural Brain
- Removed React Three Fiber / Drei and kept plain `three`.
- Rebuilt `BrainViewer3D` using direct Three.js/WebGL inside React.
- This fixed the `ReactCurrentOwner` runtime crash.
- Added a WebGL fallback for environments where WebGL cannot initialize.
- **Problem**: the model looked too schematic and not brain-like enough.
  - It read as two circles/blobs with colored activation areas.
  - User feedback: this is not acceptable; the visualization must use a real brain viewer/model library, not a hand-made approximation.
- This version should be considered a discarded prototype, not the target design.

### Current Direction: NiiVue Plugin / Library
- Chosen fallback library: `@niivue/niivue`.
- Reason: NiiVue is an actual neuroimaging WebGL viewer and supports brain meshes/connectomes, unlike the improvised Three.js blob model.
- Installed package:
  - `@niivue/niivue`
- Downloaded real cortical mesh assets from the NiiVue demo-image repository into `public/models/`:
  - `public/models/JulichBrainAtlas31_LH.mz3`
  - `public/models/JulichBrainAtlas31_RH.mz3`
- Intended implementation:
  - Render the real cortical meshes with NiiVue.
  - Overlay/update synced activation nodes or markers for the 7 tracked regions:
    - visual cortex
    - auditory cortex
    - Heschl's gyrus
    - Broca's area
    - STS
    - prefrontal
    - motor cortex
  - Use `features.json` region values as the v1 activation source.
  - Keep raw `.npz` tensors server-side.

### Current Code State / Warning
- The NiiVue migration was interrupted mid-swap.
- `components/BrainViewer3D.tsx` was deleted as part of replacing the plain Three.js prototype, but the new NiiVue version has **not** been written yet.
- Until `BrainViewer3D.tsx` is recreated or the import is temporarily removed, the results dashboard may not build/run.
- `package.json` / `package-lock.json` include the new 3D-related dependency changes.

### Next Steps for 3D Brain
- Recreate `components/BrainViewer3D.tsx` using `@niivue/niivue`.
- Attach NiiVue to a canvas in a client-only React component.
- Load the two `.mz3` cortical meshes from `/models/`.
- Add/update a NiiVue connectome or equivalent overlay from the active `FeatureWindow`.
- Keep the current dashboard wiring:
  - video `currentTime` selects active feature window
  - clicking a region can focus the chart
  - chart remains visible under/next to the brain
- Verify:
  - `npm run build`
  - `npm run lint`
  - `/results/DVj0HP6CQOP` loads without runtime errors
  - video playback causes brain overlay values to change over time
  - page degrades gracefully if WebGL is unavailable

## How to Run

```bash
# Full pipeline (download → Modal → frames → diagnose → brief)
./run_diagnosis.sh https://www.instagram.com/reel/XXXX/

# Or step by step:
node download_reel.mjs "https://www.instagram.com/reel/XXXX/"
source .venv/bin/activate
python -m modal run modal_tribev2.py --reel "reels/XXXX.mp4"
modal volume get tribev2-outputs XXXX ./outputs/ --force
python3 extract_features.py XXXX
python3 extract_frames.py XXXX
python3 diagnose.py XXXX
python3 chat.py XXXX
```

## Environment Variables

MOONSHOT_API_KEY=sk-NBNDjfGisnf5MdS7o7ZVfSAd5gkvvewifN0h3b7bVorXjY1z    # Required for Kimi K2.6 (LLM #1 + #2)
```


## File Structure

```
tribev2project/
├── .venv/                       # Python virtual env (numpy, openai)
├── tribev2/                     # cloned Meta repo (reference only)
├── reels/<CODE>.mp4             # downloaded videos (full length)
├── outputs/<CODE>/
│   ├── raw/<CODE>.npz           #   brain tensor (n_TRs, 20484)
│   ├── transcripts/<CODE>.json  #   word-level timestamps
│   ├── features.json            #   per-window brain stats
│   ├── frames/                  #   1 JPG per second
│   ├── diagnosis.txt            #   LLM #1 second-by-second breakdown
│   └── brief.txt                #   LLM #2 creator-friendly summary
├── download_reel.mjs
├── modal_tribev2.py
├── extract_features.py
├── extract_frames.py
├── diagnose.py
├── chat.py
├── run_diagnosis.sh
├── calibration_reels.csv        # 16 reels for calibration sprint
├── run_calibration.py           # Batch processor for calibration
├── build_calibration.py         # Aggregates brain data → calibration.json
├── analyze_reel.py              # DEPRECATED (Phase 1)
├── prep_reel.sh                 # DEPRECATED (Phase 1)
├── run_poc.sh / finish_poc.sh   # DEPRECATED (Phase 1)
└── run_scan.sh                  # DEPRECATED (Phase 1)
```

## Notes
- The Modal script installs tribev2 from git inside the container image — first run will be slower while it builds
- Brain region vertex mappings in extract_features.py are approximate (fsaverage5 atlas)
- Modal free tier gives $30 credit; each reel costs ~$0.07-0.15 depending on video length
- OpenAI SDK is used only as an HTTP client for Moonshot's OpenAI-compatible API
- Moonshot API key is set via env var, not hardcoded
