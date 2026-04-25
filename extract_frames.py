#!/usr/bin/env python3
"""
Extract keyframes from a video at 1 frame per second using ffmpeg.

Usage: python extract_frames.py <CODE>
"""

import sys
import subprocess
from pathlib import Path


def extract_frames(video_path, output_dir):
    """Extract 1 frame per second, scaled to 512px wide. Returns list of paths."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            "ffmpeg", "-i", str(video_path),
            "-vf", "fps=1,scale=512:-1",
            "-q:v", "3",
            "-y", "-loglevel", "warning",
            str(output_dir / "frame_%03d.jpg"),
        ],
        check=True,
    )

    return sorted(output_dir.glob("frame_*.jpg"))


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_frames.py <CODE>")
        sys.exit(1)

    code = sys.argv[1]
    video_path = Path(f"reels/{code}.mp4")
    if not video_path.exists():
        print(f"Error: {video_path} not found")
        sys.exit(1)

    output_dir = Path(f"outputs/{code}/frames")
    frames = extract_frames(video_path, output_dir)
    print(f"Extracted {len(frames)} frames to {output_dir}")


if __name__ == "__main__":
    main()
