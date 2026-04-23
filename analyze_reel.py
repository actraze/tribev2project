#!/usr/bin/env python3
"""
Analyze TRIBE v2 brain features using Moonshot's Kimi K2.6 API.

Sends the extracted features.json to Kimi K2.6 for a natural language
second-by-second neural engagement breakdown.

Usage: python analyze_reel.py <CODE>
"""

import sys
import os
import json
from pathlib import Path
from openai import OpenAI


def build_prompt(features):
    """Build the analysis prompt from extracted features."""

    # Format window data
    window_text = ""
    for w in features["windows"]:
        words_str = ""
        if w.get("words"):
            words_str = f'  Words spoken: {" ".join(w["words"])}\n'
        window_text += (
            f"[{w['start_time']}s - {w['end_time']}s]\n"
            f"  Mean activation: {w['mean_activation']}\n"
            f"  Max activation: {w['max_activation']}\n"
            f"  Fire vertices: {w['fire_vertices']} ({w['fire_vertices_pct']}%)\n"
            f"  Dominant region: {w['dominant_region']}\n"
            f"  Region breakdown: {json.dumps(w['region_activations'], indent=4)}\n"
            f"{words_str}\n"
        )

    # Format overall metrics
    overall = features["overall"]
    overall_text = (
        f"Overall mean activation: {overall['mean_activation']}\n"
        f"Trend: {overall['trend']} (first half: {overall['first_half_mean']}, second half: {overall['second_half_mean']})\n"
        f"Peak at: {overall['peak_timestamp_sec']}s (mean: {overall['peak_mean_activation']}, fire vertices: {overall['peak_fire_vertices']})\n"
        f"Overall region activations: {json.dumps(overall['region_activations'], indent=2)}\n"
    )

    # Format transcript
    transcript_text = "No transcript available."
    if features.get("transcript"):
        words = [f"{t['word']} ({t['start']:.1f}s)" for t in features["transcript"]]
        transcript_text = "Transcript (word, timestamp):\n" + ", ".join(words)

    # Region legend
    region_legend = "\n".join(
        f"  - {name}: {desc}" for name, desc in features["brain_regions"].items()
    )

    prompt = f"""You are a neuroscience-informed content analyst. You have been given brain activation data from Meta's TRIBE v2 model — a deep multimodal brain encoder that predicts fMRI-like cortical surface activity from video/audio/text stimuli.

The data below represents predicted brain responses to an Instagram Reel, sliced into 2-second windows across ~20,000 cortical vertices (fsaverage5 atlas).

## Brain Region Key
{region_legend}

## Time-Sliced Brain Activation Data
{window_text}

## Overall Metrics
{overall_text}

## Transcript
{transcript_text}

## Your Task

Provide a detailed analysis with the following structure:

### 1. Second-by-Second Breakdown
For each 2-second window, explain:
- What's happening neurologically (which regions are firing and what that means for content processing)
- What the viewer is likely experiencing (attention, emotion, comprehension)
- How the spoken words (if any) relate to the brain response

### 2. Strongest Moments
Identify the 2-3 moments with the highest neural engagement. Explain WHY they work — which brain regions activated and what that tells us about the content's impact.

### 3. Weakest Moments
Identify the 2-3 moments with the lowest engagement. Explain what's missing and why the brain isn't responding strongly.

### 4. Actionable Recommendations
Give exactly 3 specific, actionable recommendations to improve this content's neural engagement. Be concrete — reference specific timestamps and brain regions.

### 5. Neural Engagement Score
Rate overall neural engagement on a scale of 1-10, with a brief justification referencing the data.

Be specific, reference the actual numbers, and ground every claim in the brain activation data provided."""

    return prompt


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_reel.py <CODE>")
        sys.exit(1)

    code = sys.argv[1]
    features_path = Path(f"outputs/{code}/features.json")

    if not features_path.exists():
        print(f"Error: {features_path} not found. Run extract_features.py first.")
        sys.exit(1)

    api_key = os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        print("Error: MOONSHOT_API_KEY environment variable not set.")
        print("Get your key from platform.moonshot.ai and run:")
        print('  export MOONSHOT_API_KEY="your-key-here"')
        sys.exit(1)

    features = json.loads(features_path.read_text())
    prompt = build_prompt(features)

    print(f"Analyzing reel {code} with Kimi K2.6...")
    print(f"Sending {len(prompt)} chars to Moonshot API...")
    print()

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.moonshot.ai/v1",
    )

    response = client.chat.completions.create(
        model="kimi-k2.6",
        messages=[{"role": "user", "content": prompt}],
    )

    analysis = response.choices[0].message.content

    # Print to terminal
    print("=" * 60)
    print("NEURAL ENGAGEMENT ANALYSIS")
    print("=" * 60)
    print(analysis)
    print("=" * 60)

    # Save to file
    out_path = Path(f"outputs/{code}/analysis.txt")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(analysis)
    print(f"\nSaved analysis to {out_path}")


if __name__ == "__main__":
    main()
