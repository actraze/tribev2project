#!/usr/bin/env python3
"""
LLM #1: Multimodal neural engagement diagnosis.

Sends brain activation data + keyframes + transcript to Kimi K2.6
for a comprehensive second-by-second engagement breakdown.

Usage: python diagnose.py <CODE>
"""

import sys
import os
import json
import base64
import numpy as np
from pathlib import Path
from openai import OpenAI

# Brain region vertex ranges (fsaverage5, 20484 vertices total)
BRAIN_REGIONS = {
    "prefrontal": [(7500, 9000), (17742, 19242)],
    "sts": [(3200, 4500), (13442, 14742)],
    "visual_cortex": [(0, 1200), (10242, 11442)],
    "auditory_cortex": [(3500, 4200), (13742, 14442)],
    "heschls_gyrus": [(3800, 4100), (14042, 14342)],
    "brocas_area": [(6500, 7200), (16742, 17442)],
    "motor_cortex": [(5500, 6500), (15742, 16742)],
}

SYSTEM_PROMPT_HEADER = """\
You are a neuroscience-informed content diagnostician working with Meta's TRIBE v2 \
brain encoder — a deep multimodal model that predicts fMRI-like cortical surface \
activity (20,484 vertices on the fsaverage5 atlas) from video/audio/text stimuli.

You are receiving three synchronized data streams for an Instagram Reel:
1. KEYFRAME IMAGES — exactly what the viewer sees at each second
2. BRAIN ACTIVATION DATA — per-second mean activation across 7 cortical regions
3. TRANSCRIPT — word-level timestamps of spoken content

## Brain Regions

| Region | HIGH activation means |
|--------|----------------------|
| prefrontal | Active thinking, evaluating, decision-making |
| sts (superior temporal sulcus) | Social/emotional processing — faces, body language |
| visual_cortex | Visually compelling or complex content |
| auditory_cortex | Audio engagement — music, sound effects |
| heschls_gyrus | Speech perception — actively processing words |
| brocas_area | Language comprehension — decoding novel language |
| motor_cortex | Mirror neuron response — movement, dance, actions |"""

SYSTEM_PROMPT_FOOTER = """\
## Your Output

### SECOND-BY-SECOND BREAKDOWN
For each second (or group of 2–3 similar seconds), one paragraph combining:
• What's visually on screen (you can SEE the frames — describe what you see)
• Which brain regions responded and how strongly (cite the numbers)
• What the viewer is likely experiencing
• How spoken words relate to the neural response

### PEAK MOMENTS
2–3 seconds with strongest engagement. What made them work.

### DEAD ZONES
2–3 seconds with weakest engagement. What's missing.

### RECOMMENDATIONS
3 specific, actionable changes. Reference exact timestamps.

### OVERALL ASSESSMENT
One paragraph summary of this reel's neural engagement profile.

Ground every claim in the data. You can see the frames — never guess. Cite activation values."""

FALLBACK_CALIBRATION = """\
## Activation Scale (empirical, from 14 calibration reels across 4 content types)

| Percentile | Region activation value | Interpretation |
|---|---|---|
| P0 (floor) | -0.1053 | Suppression / inhibition |
| P25 | -0.0042 | Below baseline |
| P50 (median) | 0.0241 | Typical |
| P75 | 0.0562 | Above average |
| P90 | 0.0929 | High |
| P95 | 0.1158 | Very high |
| Max observed | 0.1946 | Ceiling of TRIBE v2 output |

CRITICAL: Absolute activation magnitude does NOT predict real-world engagement. \
In our calibration set, low-performing reels (200–34K views) frequently showed HIGHER \
mean activation than viral reels (1M–12M views).

What DOES matter for your diagnosis:
1. RELATIVE patterns — which seconds spike vs dip within THIS reel
2. REGIONAL signatures — which brain regions dominate at each moment and what that implies
3. TEMPORAL dynamics — trend direction, buildup/decay, whether peaks align with key content moments
4. Use the percentile table above to characterize where values fall in TRIBE v2's output range — NOT to judge engagement quality"""


def load_calibration_block():
    """Load pre-rendered calibration block from calibration.json."""
    cal_path = Path("outputs/calibration.json")
    if cal_path.exists():
        cal = json.loads(cal_path.read_text())
        if "prompt_block" in cal:
            return cal["prompt_block"]
    return FALLBACK_CALIBRATION

MAX_FRAMES = 30  # stay within ~85K image tokens + headroom


def region_activation(tensor_row, ranges):
    """Mean activation for a brain region given vertex index ranges."""
    idx = []
    for s, e in ranges:
        idx.extend(range(s, min(e, len(tensor_row))))
    return float(np.mean(tensor_row[idx])) if idx else 0.0


def load_brain(npz_path):
    """Load brain tensor → list of per-second region-activation dicts."""
    data = np.load(npz_path)
    for key in ("brain_activations", "arr_0", "preds"):
        if key in data.files:
            tensor = data[key]; break
    else:
        tensor = data[data.files[0]]

    per_sec = []
    for t in range(tensor.shape[0]):
        per_sec.append({
            r: round(region_activation(tensor[t], v), 3)
            for r, v in BRAIN_REGIONS.items()
        })
    return per_sec


def load_transcript(path):
    """Load transcript → {second: [words]}."""
    if not path.exists():
        return {}
    words = json.loads(path.read_text())
    by_sec = {}
    for w in words:
        s = int(w["start"])
        by_sec.setdefault(s, []).append(w["word"])
    return by_sec


def load_frames(frames_dir, n_seconds):
    """Load frames as base64, sample to MAX_FRAMES if needed. Returns {second: b64}."""
    all_frames = sorted(Path(frames_dir).glob("frame_*.jpg"))
    if not all_frames:
        return {}

    # frame_001.jpg = second 0, frame_002.jpg = second 1, etc.
    if len(all_frames) <= MAX_FRAMES:
        indices = list(range(len(all_frames)))
    else:
        step = len(all_frames) / MAX_FRAMES
        indices = [int(i * step) for i in range(MAX_FRAMES)]

    out = {}
    for i in indices:
        if i < len(all_frames):
            out[i] = base64.b64encode(all_frames[i].read_bytes()).decode()
    return out


def build_messages(brain, transcript, frames, n_seconds, system_prompt):
    """Build the multimodal chat messages."""
    content = [{
        "type": "text",
        "text": (
            f"Analyze this {n_seconds}-second Instagram Reel.\n"
            f"Each second has brain activation data. "
            f"Seconds with keyframe images are shown inline.\n\n"
        ),
    }]

    for t in range(n_seconds):
        # image (if available for this second)
        if t in frames:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{frames[t]}"},
            })

        # brain activations
        act = brain[t]
        parts = ", ".join(f"{r}={v}" for r, v in act.items())

        # transcript
        words = transcript.get(t, [])
        tx = f'  Transcript: "{" ".join(words)}"' if words else ""

        content.append({"type": "text", "text": f"**Second {t}:** {parts}{tx}\n"})

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]


def main():
    if len(sys.argv) < 2:
        print("Usage: python diagnose.py <CODE>")
        sys.exit(1)

    code = sys.argv[1]
    npz_path   = Path(f"outputs/{code}/raw/{code}.npz")
    trans_path = Path(f"outputs/{code}/transcripts/{code}.json")
    frames_dir = Path(f"outputs/{code}/frames")

    if not npz_path.exists():
        print(f"Error: {npz_path} not found. Run Modal processing first.")
        sys.exit(1)

    api_key = os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        print("Error: MOONSHOT_API_KEY not set.")
        print('  export MOONSHOT_API_KEY="your-key-here"')
        sys.exit(1)

    # Load everything
    print(f"Loading brain data from {npz_path}...")
    brain = load_brain(str(npz_path))
    n_seconds = len(brain)
    print(f"  {n_seconds} seconds of brain data")

    transcript = load_transcript(trans_path)
    n_words = sum(len(v) for v in transcript.values())
    print(f"  {n_words} transcript words")

    frames = load_frames(frames_dir, n_seconds)
    print(f"  {len(frames)} keyframes loaded")

    if not frames:
        print("  WARNING: No frames found — diagnosis will be text-only (no visual context)")

    # Assemble system prompt with calibration data
    calibration_block = load_calibration_block()
    system_prompt = SYSTEM_PROMPT_HEADER + "\n\n" + calibration_block + "\n\n" + SYSTEM_PROMPT_FOOTER

    # Build and send
    messages = build_messages(brain, transcript, frames, n_seconds, system_prompt)

    print(f"\nCalling Kimi K2.6 for multimodal diagnosis...")
    client = OpenAI(api_key=api_key, base_url="https://api.moonshot.ai/v1")

    response = client.chat.completions.create(
        model="kimi-k2.6",
        messages=messages,
    )

    diagnosis = response.choices[0].message.content

    out_path = Path(f"outputs/{code}/diagnosis.txt")
    out_path.write_text(diagnosis)
    print(f"Saved diagnosis to {out_path}")
    print(f"\n{'=' * 60}")
    print(diagnosis)
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
