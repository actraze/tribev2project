# TRIBE v2 Web App — Product Requirements Document

**Last updated**: April 24, 2026
**Status**: Planning
**Author**: Zaid + Claude

---

## 1. What We're Building

A web app that lets anyone upload a video and get a neuroscience-powered engagement analysis. The user uploads a video, we run it through Meta's TRIBE v2 brain encoder (simulated fMRI on GPU), then an LLM cross-references the brain data with keyframes and transcript to produce a second-by-second breakdown of what works and what doesn't. The user can then chat with an AI about the results.

**One-liner**: Upload a reel. See how brains react. Chat about it.

---

## 2. User Flow

```
Landing Page → Upload Video → Processing (loading) → Results Dashboard + Chat
```

### 2.1 Landing Page (`/`)
- Dark theme, full-viewport hero
- **3D rotating brain mesh** (Three.js) with glowing neural regions and bloom postprocessing
- Tagline + brief explanation of what TRIBE v2 does
- **"Try Now"** button → goes straight to upload
- Optional: 3 "How it works" step cards below the fold

### 2.2 Upload Page (`/scan`)
- Drag-and-drop zone for video files (`.mp4`, `.mov`, `.webm`)
- File picker fallback
- Max ~100MB
- No auth, no login — hackathon mode
- On submit → redirect to processing page

### 2.3 Processing Page (`/processing/{id}`)
- Animated pulsing 3D brain
- Step-by-step progress indicator (real-time via SSE):
  1. Uploading video
  2. Brain encoding (GPU) — *this is the long step, ~10-12 min*
  3. Pulling results
  4. Extracting features & frames
  5. Running neural diagnosis (LLM)
  6. Generating summary
- **Total processing time: ~14-15 minutes**
- Auto-redirects to results when done

### 2.4 Results Dashboard (`/results/{id}`)

**Layout**: Two-panel split

**Left panel (60%)**:
- **Video player** (HTML5) — playback controls, seeking
- **Brain activation timeline** — line/area chart showing 7 brain regions over time (x = seconds, y = activation level). Vertical cursor syncs with video playback position. Clicking the chart seeks the video.
- **Transcript** — word-by-word, highlighted in sync with video time
- **Frame strip** — horizontal scrolling row of keyframe thumbnails (1/second), active frame highlighted

**Right panel (40%)**:
- **AI Chat** (streaming, ChatGPT-style)
- Starts with a pre-computed executive brief (hook verdict, top moments, weak spots, the one change, retention prediction)
- User can ask follow-up questions about the diagnosis
- Responses stream in real-time

**Sync behavior**: Video time drives everything. As the video plays, the chart cursor moves, the transcript highlights, and the frame strip scrolls. Clicking anywhere on the chart or frame strip seeks the video.

---

## 3. Architecture

### 3.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | **Next.js 15** (App Router) + React + TypeScript |
| UI components | **shadcn/ui** + Tailwind CSS (dark theme) |
| 3D brain | **React Three Fiber** + drei + postprocessing |
| Charts | **Recharts** (7-region area chart) |
| Backend API | **Next.js API routes** (orchestrate Python scripts via child_process) |
| Brain encoding | **Modal** (A10G GPU, remote) |
| LLM (diagnosis) | **Kimi K2.6** via Moonshot API (multimodal, 128K context) |
| LLM (chat) | **Kimi K2.6** via Moonshot API (streaming) |
| Database | **Supabase** (Postgres) — analysis history + chat messages |
| Hosting | **Hetzner VPS** (Ubuntu) via **Docker** |

### 3.2 Why VPS, Not Vercel

The brain encoding pipeline takes **14-15 minutes**. Vercel's max function timeout is 300s (Pro) / 900s (Enterprise) — neither is enough. A VPS with Docker gives us:
- No timeout limits
- Full filesystem access for video files and outputs
- Modal CLI installed and authenticated in the container
- Python environment with all dependencies
- Single-server simplicity for a hackathon

### 3.3 System Diagram

```
Browser                         Hetzner VPS (Docker)              Supabase
  │                                    │                              │
  ├── GET /                            │                              │
  │   Landing page + 3D brain          │                              │
  │                                    │                              │
  ├── POST /api/scan                   │                              │
  │   Upload .mp4 ──────────────────►  Save to disk ──────────────►  INSERT analyses
  │   ◄── { id: "abc123" }            │                              │
  │                                    │                              │
  ├── GET /api/progress/abc123 (SSE)   │                              │
  │   ◄── step: brain_encoding...     ├── modal run (14 min) ─────►  UPDATE current_step
  │   ◄── step: extracting...         ├── extract_features.py        │
  │   ◄── step: diagnosing...         ├── extract_frames.py          │
  │   ◄── step: done                  ├── diagnose.py ────────────►  UPDATE diagnosis, brief
  │                                    ├── chat.py                    │  status='completed'
  │                                    │                              │
  ├── GET /api/results/abc123          │                              │
  │   ◄── features + brief + meta  ◄──┼──────────────────────────── SELECT from analyses
  │                                    │                              │
  ├── GET /api/video/abc123            │                              │
  │   ◄── MP4 stream (Range)          ├── Serve from reels/          │
  │                                    │                              │
  ├── GET /api/frames/abc123/frame_001 │                              │
  │   ◄── JPEG                        ├── Serve from outputs/frames/ │
  │                                    │                              │
  ├── POST /api/chat (SSE)            │                              │
  │   { messages }  ──────────────────► Kimi K2.6 streaming ──────►  INSERT chat_messages
  │   ◄── text chunks                 │                              │
  │                                    │                              │
  └── GET /api/history                 │                              │
      ◄── past analyses list  ◄────────┼──────────────────────────── SELECT from analyses
```

### 3.4 API Routes

| Route | Method | What it does |
|-------|--------|-------------|
| `/api/scan` | POST (multipart) | Accept video upload, save file, generate ID, start pipeline in background |
| `/api/progress/[id]` | GET (SSE) | Stream pipeline progress events until done |
| `/api/results/[id]` | GET (JSON) | Return features.json, brief.txt, transcript, metadata |
| `/api/frames/[id]/[file]` | GET | Serve individual frame JPEG |
| `/api/video/[id]` | GET | Serve video MP4 with HTTP Range support (seeking) |
| `/api/chat` | POST (SSE) | Streaming multi-turn chat — diagnosis as context → Kimi K2.6. Saves messages to Supabase |
| `/api/history` | GET (JSON) | List all past analyses from Supabase (id, filename, date, status, thumbnail) |

---

## 4. Database & History (Supabase)

Users can return to past analyses and continue chatting. No auth — analyses are linked by a shareable URL (`/results/{id}`). Supabase provides hosted Postgres + auto-generated REST API.

### 4.1 Tables

**`analyses`** — One row per video upload

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK, default gen) | Analysis ID, used in URLs |
| `status` | `text` | `processing`, `completed`, `failed` |
| `current_step` | `int` | Pipeline step number (1-7) for progress tracking |
| `video_filename` | `text` | Original uploaded filename |
| `video_duration_sec` | `float` | Duration in seconds |
| `frame_count` | `int` | Number of extracted keyframes |
| `features` | `jsonb` | Full `features.json` content (brain data for charts) |
| `transcript` | `jsonb` | Word-level timestamps array |
| `diagnosis` | `text` | Full `diagnosis.txt` from LLM #1 |
| `brief` | `text` | `brief.txt` from LLM #2 |
| `created_at` | `timestamptz` | Upload time |
| `completed_at` | `timestamptz` | When pipeline finished |

**`chat_messages`** — Conversation history per analysis

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` (PK) | |
| `analysis_id` | `uuid` (FK → analyses) | |
| `role` | `text` | `user` or `assistant` |
| `content` | `text` | Message text |
| `created_at` | `timestamptz` | |

### 4.2 How It Changes the Flow

1. **Upload** (`POST /api/scan`): Creates a row in `analyses` with `status: 'processing'`. Returns the `id`.
2. **Pipeline progress**: Updates `current_step` in the DB as each step completes. SSE reads from DB.
3. **Pipeline complete**: Writes `features`, `transcript`, `diagnosis`, `brief` into the row. Sets `status: 'completed'`.
4. **Results page** (`/results/{id}`): Reads analysis data from Supabase (not filesystem). Video and frames still served from disk.
5. **Chat**: Each message (user + assistant) is saved to `chat_messages`. On page reload, chat history is restored from DB.
6. **History page** (`/history`): Lists all past analyses with thumbnail, filename, date, status. Click to reopen.

### 4.3 What's Stored Where

| Data | Supabase | Disk |
|------|----------|------|
| Brain features (JSON) | Yes | Yes (`features.json`) |
| Transcript | Yes | Yes (`transcripts/{id}.json`) |
| Diagnosis text | Yes | Yes (`diagnosis.txt`) |
| Brief text | Yes | Yes (`brief.txt`) |
| Chat messages | Yes | No |
| Video file | No | Yes (`reels/{id}.mp4`) |
| Frame images | No | Yes (`outputs/{id}/frames/`) |
| Brain tensor (.npz) | No | Yes (`outputs/{id}/raw/`) |

Supabase is the source of truth for metadata + text. Disk is the source of truth for binary files (video, frames, tensor). If the DB has the analysis but disk is wiped, the text data and chat survive but video/frames won't load.

### 4.4 New Page: History (`/history`)

- Grid/list of past analyses
- Each card shows: video thumbnail (frame_001), original filename, date, duration, status
- Click → `/results/{id}`
- Link from the landing page nav ("Past Analyses")

### 4.5 Environment

Add to `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server-side only, for writes
```

---

## 5. Backend Pipeline (Already Built)

The backend pipeline exists as Python/Node CLI scripts. The web app wraps them.

| Step | Script | Input | Output | Time | Cost |
|------|--------|-------|--------|------|------|
| 1 | (upload) | Video file | `reels/{id}.mp4` | seconds | — |
| 2 | `modal_tribev2.py` | MP4 file | Brain tensor `.npz` + transcript JSON | ~12-14 min | ~$0.10 |
| 3 | `extract_features.py` | `.npz` tensor | `features.json` (per-window brain stats) | seconds | — |
| 4 | `extract_frames.py` | MP4 file | 1 JPEG per second | seconds | — |
| 5 | `diagnose.py` | Brain data + frames + transcript → Kimi K2.6 | `diagnosis.txt` | ~30s | ~$0.05 |
| 6 | `chat.py` | diagnosis.txt → Kimi K2.6 | `brief.txt` | ~15s | ~$0.01 |

**Total: ~15 min, ~$0.16 per video**

### 4.1 What the Pipeline Produces

For each video, `outputs/{id}/` contains:
- `raw/{id}.npz` — Brain tensor (n_seconds x 20,484 cortical vertices)
- `transcripts/{id}.json` — Word-level timestamps
- `features.json` — Per-2s-window activation stats for 7 brain regions
- `frames/frame_001.jpg, frame_002.jpg, ...` — 1 keyframe per second
- `diagnosis.txt` — Full second-by-second neural breakdown (~8KB text)
- `brief.txt` — Creator-friendly executive summary

### 4.2 Brain Regions

| Region | What it signals | Chart color |
|--------|----------------|-------------|
| Prefrontal | Attention, decision-making | `#06b6d4` cyan |
| STS | Social cognition, face processing | `#10b981` emerald |
| Visual cortex | Visual processing intensity | `#3b82f6` blue |
| Auditory cortex | Sound/music processing | `#f59e0b` amber |
| Heschl's gyrus | Speech perception | `#f43f5e` rose |
| Broca's area | Language comprehension | `#8b5cf6` violet |
| Motor cortex | Action/movement response | `#f97316` orange |

---

## 5. Data Shapes

### features.json (drives the brain timeline chart)
```json
{
  "code": "DVj0HP6CQOP",
  "n_trs": 29,
  "total_duration_sec": 29.0,
  "windows": [
    {
      "window_index": 0,
      "start_time": 0.0,
      "end_time": 2.0,
      "mean_activation": 0.042,
      "dominant_region": "heschls_gyrus",
      "region_activations": {
        "visual_cortex": 0.031,
        "auditory_cortex": 0.048,
        "heschls_gyrus": 0.062,
        "brocas_area": 0.019,
        "sts": 0.044,
        "prefrontal": 0.037,
        "motor_cortex": 0.028
      },
      "words": ["Did", "Cloud", "Code"]
    }
  ],
  "overall": {
    "mean_activation": 0.038,
    "trend": "rising",
    "peak_timestamp_sec": 14.0,
    "region_activations": { ... }
  }
}
```

### Transcript JSON
```json
[
  {"word": "Did", "start": 0.658, "duration": 0.1, "end": 0.758},
  {"word": "Cloud", "start": 0.778, "duration": 0.2, "end": 0.978}
]
```

---

## 6. Deployment

### Docker Setup (Hetzner VPS)

```
docker-compose.yml
├── app (Next.js)
│   ├── Node.js 20
│   ├── Python 3.11 + .venv (numpy, openai)
│   ├── Modal CLI (authenticated)
│   ├── ffmpeg
│   └── yt-dlp (optional, not needed for uploads)
└── volumes:
    ├── ./reels → /app/reels
    └── ./outputs → /app/outputs
```

**Environment variables**:
- `MOONSHOT_API_KEY` — Kimi K2.6 API
- `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` — Modal GPU access
- `HF_TOKEN` — HuggingFace (for model downloads in Modal)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (client-side reads)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service key (server-side writes)

### Deploy flow
1. Push to GitHub
2. SSH into VPS, `git pull && docker-compose up --build -d`
3. (or set up GitHub Actions for auto-deploy)

---

## 7. Project Cleanup (Before Starting Frontend)

Current root has 14 scripts from different phases mixed together. Proposed reorganization:

```
tribev2project/
├── pipeline/                    # Core pipeline scripts
│   ├── modal_tribev2.py
│   ├── extract_features.py
│   ├── extract_frames.py
│   ├── diagnose.py
│   ├── chat.py
│   └── download_reel.mjs       # kept but not used in web flow
├── calibration/                 # Calibration sprint artifacts
│   ├── run_calibration.py
│   ├── build_calibration.py
│   ├── calibration_reels.csv
│   └── Instagram Data - Sheet1.csv
├── _deprecated/                 # Phase 1 scripts (archive)
│   ├── analyze_reel.py
│   ├── prep_reel.sh
│   ├── run_poc.sh
│   ├── finish_poc.sh
│   ├── run_scan.sh
│   └── tribe-v2-poc-instructions.md
├── app/                         # Next.js frontend (new)
├── components/                  # React components (new)
├── lib/                         # Shared utilities (new)
├── public/                      # Static assets (new)
├── reels/                       # Uploaded videos (gitignored)
├── outputs/                     # Pipeline outputs (gitignored)
├── .venv/                       # Python venv (gitignored)
├── tribev2/                     # Meta repo clone (gitignored)
├── run_diagnosis.sh             # CLI master script (keep at root)
├── CLAUDE.md
├── ARCHITECTURE.md
├── PROGRESS.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 8. Build Order

| Phase | What | Deliverable |
|-------|------|-------------|
| 0 | Project cleanup — reorganize folders | Clean repo |
| 1 | Supabase setup — create tables, install client | DB ready |
| 2 | Results dashboard — use existing output data to build and test | Working `/results/{id}` page with video, chart, transcript, frames |
| 3 | Chat panel — streaming SSE chat with Kimi K2.6 + message persistence | Interactive chat on results page, messages survive reload |
| 4 | History page — list past analyses | `/history` with cards linking to past results |
| 5 | Landing page — 3D brain, hero, CTA | Visually impressive `/` |
| 6 | Upload + pipeline + processing — wire end-to-end with DB writes | Full flow: upload → process → results → persisted |
| 7 | Docker + deploy — containerize and ship to Hetzner | Live on VPS |
| 8 | Polish — error handling, loading states, responsive | Demo-ready |

---

## 9. Open Questions

1. **Domain**: Do we have a domain name for this, or just IP:port?
2. **Concurrent users**: Should we queue pipeline jobs, or is it one-at-a-time for the demo? Answer: Max concurrent users at the moment is 10 because of modal limit, but I generally don't care because we'll likely be the only user, and for demo purposes we'll have a preloaded/processed video.
3. **Video length limit**: Modal costs scale with duration. Cap at 60s? 120s? Answer: cap at 30sec
4. **Mobile**: Results dashboard is complex — do we need mobile support or is desktop-only fine for the hackathon? Answer: desktop only is fine
5. **Brain mesh source**: Need a CC0 brain GLB file. Options: Sketchfab, export from FreeSurfer, or procedural geometry. Answer: no idea, your call

---

## 10. Cost Estimate (Per Analysis)

| Resource | Cost |
|----------|------|
| Modal A10G GPU (~14 min) | ~$0.10 |
| Kimi K2.6 diagnosis (88K tokens in) | ~$0.05 |
| Kimi K2.6 brief | ~$0.01 |
| Kimi K2.6 per chat message | ~$0.01 |
| **Total per video** | **~$0.16 + $0.01/message** |
| Hetzner VPS | ~$5-10/mo |
