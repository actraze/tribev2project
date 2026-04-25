#!/usr/bin/env python3
"""
LLM #2: Creator-facing executive brief from neural diagnosis.

Takes the diagnosis.txt from LLM #1 and produces an actionable
creator-friendly summary. Optionally accepts a custom question.

Usage:
  python chat.py <CODE>                    # default brief
  python chat.py <CODE> "your question"    # custom question
"""

import sys
import os
from pathlib import Path
from openai import OpenAI

SYSTEM_PROMPT = """\
You are a content strategist who helps Instagram creators maximize engagement on \
their Reels. You've received a detailed neuroscience-based diagnosis of a reel — \
a second-by-second breakdown of how the human brain responds to the content, \
produced by Meta's TRIBE v2 brain encoder.

Your job: distill this into a creator-friendly brief. The creator doesn't care \
about brain regions or activation values. They care about:
- What moments hook viewers and why
- Where viewers mentally check out and why
- Exactly what to change to improve performance

Rules:
- Be direct. No hedging ("it might be…"), no jargon ("prefrontal activation").
- Reference exact timestamps ("at second 4", "the first 3 seconds").
- Translate brain science into creator language ("your hook lands because the \
viewer's attention snaps to the face + text combo" not "prefrontal and STS \
activation is elevated").
- Write like you're talking to the creator face-to-face."""

DEFAULT_QUESTION = """\
Based on this diagnosis, give me:

1. **HOOK VERDICT** — Do the first 3 seconds grab attention? If not, what should change?
2. **TOP 3 MOMENTS** — Timestamps + what makes them work in plain language
3. **TOP 3 WEAK SPOTS** — Timestamps + what's going wrong + specific fix for each
4. **THE ONE CHANGE** — If you could only change ONE thing, what has the biggest impact?
5. **RETENTION PREDICTION** — Where do most viewers likely drop off, and why?"""


def main():
    if len(sys.argv) < 2:
        print("Usage: python chat.py <CODE> [question]")
        sys.exit(1)

    code = sys.argv[1]
    question = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else DEFAULT_QUESTION

    diagnosis_path = Path(f"outputs/{code}/diagnosis.txt")
    if not diagnosis_path.exists():
        print(f"Error: {diagnosis_path} not found. Run diagnose.py first.")
        sys.exit(1)

    api_key = os.environ.get("MOONSHOT_API_KEY")
    if not api_key:
        print("Error: MOONSHOT_API_KEY not set.")
        sys.exit(1)

    diagnosis = diagnosis_path.read_text()
    print(f"Loaded diagnosis ({len(diagnosis)} chars)")
    print(f"Sending to LLM #2 for creator brief...\n")

    client = OpenAI(api_key=api_key, base_url="https://api.moonshot.ai/v1")

    response = client.chat.completions.create(
        model="kimi-k2.6",
        messages=[
            {
                "role": "system",
                "content": (
                    SYSTEM_PROMPT
                    + "\n\n---\n\nFull neural diagnosis of the reel:\n\n"
                    + diagnosis
                ),
            },
            {"role": "user", "content": question},
        ],
    )

    brief = response.choices[0].message.content

    out_path = Path(f"outputs/{code}/brief.txt")
    out_path.write_text(brief)
    print(f"Saved brief to {out_path}")
    print(f"\n{'=' * 60}")
    print(brief)
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
