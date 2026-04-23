# TRIBE v2 Proof of Concept — Claude Code Instructions

## What We're Building

A proof-of-concept pipeline that:
1. Takes an Instagram Reel
2. Runs it through Meta's TRIBE v2 brain encoder on Modal (GPU cloud)
3. Extracts time-sliced brain activation features from the output
4. Feeds those features to Claude's API for a natural language second-by-second content breakdown

No MLP, no training. Just proving the pipeline works end to end.

---

## Prerequisites (I need to do these manually before starting)

- [ ] Mac or Linux with Python 3.11+ installed
- [ ] Hugging Face account created at huggingface.co
- [ ] LLaMA 3.2 3B access requested at huggingface.co/meta-llama/Llama-3.2-3B (takes 1-4 hours to approve)
- [ ] Modal.com account created (free, gives $30 starter credit)
- [ ] Node.js installed (for the Reel downloader)
- [ ] One Instagram Reel URL ready to test with
- [ ] Moonshot API key for Kimi K2.6 (from platform.moonshot.ai)

---

## Phase 1: Environment Setup

Prompt Claude Code with:

```
Set up the TRIBE v2 environment:

1. Clone the TRIBE v2 repo: git clone https://github.com/facebookresearch/tribev2.git
2. Install Modal CLI: pip install modal
3. Run modal setup: python -m modal setup (this will open a browser for auth)
4. Install huggingface_hub: pip install huggingface_hub
5. Run: huggingface-cli login (I'll paste my token when prompted)
6. Create the Modal HF secret: modal secret create huggingface HF_TOKEN=<my_token>
7. Install ffmpeg if not present: brew install ffmpeg
8. Install numpy and openai SDK: pip install numpy openai
```

---

## Phase 2: Download and Prep a Reel

Prompt Claude Code with:

```
Write me a script called download_reel.mjs that:
- Takes an Instagram Reel URL as a CLI argument
- Uses the Apify Instagram scraper to download the video
- Saves it to a ./reels/ directory
- Extracts the reel code from the URL and uses it as the filename

Then write a bash script called prep_reel.sh that:
- Takes the reel code as argument
- Uses ffmpeg to trim the video to 10 seconds
- Saves as reels/<CODE>-10s.mp4
- Prints the output path when done
```

---

## Phase 3: Run TRIBE v2 on Modal

Prompt Claude Code with:

```
Look at the tribev2 repo we cloned and find or write the modal_tribev2.py script.
It should:
- Run on a Modal A10G GPU
- Load the TRIBE v2 model with HF weights
- Process the input reel video
- Save outputs (.npz brain tensor, heatmaps, transcript) to a Modal volume called tribev2-outputs

Then write a bash script called run_scan.sh that:
- Takes the reel code as argument
- Runs: modal run --detach modal_tribev2.py --reel reels/<CODE>-10s.mp4
- Prints instructions for how to check when it's done
- Prints the command to pull results: modal volume get tribev2-outputs <CODE> ./outputs/<CODE>
```

---

## Phase 4: Feature Extraction (the critical part)

Prompt Claude Code with:

```
Write a Python script called extract_features.py that:

Takes a path to a .npz file from TRIBE v2 output as input.

The .npz contains a brain activation tensor with shape (n_TRs, 20484) where:
- n_TRs = number of time points in the video
- 20484 = cortical vertices

The script should:

1. Load the .npz file
2. Slice the tensor into 2-second windows
3. For each window, compute:
   - mean activation across all vertices
   - max activation
   - number of "fire vertices" (activation > 0.5)
   - dominant brain region (map vertex indices to known regions: auditory cortex, visual cortex, Broca's area, Heschl's gyrus, STS — use approximate vertex index ranges, document your assumptions)
4. Also compute overall metrics:
   - overall mean activation
   - overall trend (rising vs falling — compare first half to second half)
   - peak timestamp
   - total fire vertices at peak

5. If a transcript JSON file exists at the expected path (outputs/<CODE>/transcripts/<CODE>.json), load it and align words to the time windows

6. Output everything as a structured JSON file: outputs/<CODE>/features.json

Print the JSON to stdout as well so I can inspect it.
```

---

## Phase 5: Kimi K2.6 (Moonshot API) Integration

Prompt Claude Code with:

```
Write a Python script called analyze_reel.py that:

1. Takes a reel code as CLI argument
2. Loads outputs/<CODE>/features.json
3. Builds a prompt that includes:
   - The full time-sliced feature data (activation per window, fire vertices, dominant regions)
   - The transcript with timestamps (if available)
   - Instructions telling the model to:
     - Give a second-by-second breakdown of what's happening neurologically
     - Identify the strongest and weakest moments
     - Explain WHY each moment works or doesn't (based on which brain regions activated)
     - Give 3 specific, actionable recommendations to improve the content
     - Rate the overall "neural engagement" on a scale of 1-10

4. Calls the Moonshot API using the OpenAI-compatible endpoint:
   - Base URL: https://api.moonshot.ai/v1
   - Model: kimi-k2.6
   - Use the openai Python SDK (pip install openai)
   - Example:
     ```python
     from openai import OpenAI
     client = OpenAI(
         api_key=os.environ["MOONSHOT_API_KEY"],
         base_url="https://api.moonshot.ai/v1"
     )
     response = client.chat.completions.create(
         model="kimi-k2.6",
         messages=[{"role": "user", "content": prompt}]
     )
     ```
5. Prints the full response to the terminal
6. Also saves it to outputs/<CODE>/analysis.txt

Use my MOONSHOT_API_KEY from environment variable.
```

---

## Phase 6: One-Command Runner

Prompt Claude Code with:

```
Write a master script called run_poc.sh that chains everything:

Usage: ./run_poc.sh <INSTAGRAM_REEL_URL>

Steps:
1. Extract reel code from URL
2. Download the reel (download_reel.mjs)
3. Trim to 10s (prep_reel.sh)
4. Fire TRIBE v2 on Modal (run_scan.sh)
5. Print: "TRIBE v2 processing... this takes ~12 minutes."
6. Print: "When done, run: ./finish_poc.sh <CODE>"

Then write finish_poc.sh that:
1. Pulls results from Modal volume
2. Runs feature extraction
3. Runs Claude analysis
4. Prints the final breakdown
```

---

## How to Run the Full POC

```bash
# Step 1: Start the scan
./run_poc.sh https://www.instagram.com/reel/ABC123/

# Step 2: Wait ~12 minutes, then finish
./finish_poc.sh ABC123
```

Expected final output: a second-by-second natural language breakdown of the Reel's neural engagement, with actionable recommendations.

---

## File Structure When Done

```
project/
├── tribev2/                  # cloned repo
├── reels/
│   ├── ABC123.mp4            # downloaded reel
│   └── ABC123-10s.mp4        # trimmed reel
├── outputs/
│   └── ABC123/
│       ├── raw/ABC123.npz    # brain tensor
│       ├── heatmaps/         # cortex visualizations
│       ├── transcripts/      # whisper timestamps
│       ├── features.json     # extracted features
│       └── analysis.txt      # Claude's breakdown
├── download_reel.mjs
├── prep_reel.sh
├── run_scan.sh
├── extract_features.py
├── analyze_reel.py
├── run_poc.sh
└── finish_poc.sh
```

---

## Notes

- The .npz tensor key might not be 'arr_0' — check with `np.load(path).files` to see actual key names
- Vertex-to-brain-region mapping is approximate — TRIBE v2 docs or the fsaverage atlas will have exact mappings
- If Modal's free tier limits concurrency, jobs will queue — just wait
- Total cost for one reel: ~$0.07 on Modal + a few cents on Moonshot API
