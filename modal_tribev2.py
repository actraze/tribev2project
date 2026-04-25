"""
TRIBE v2 inference on Modal (A10G GPU).

Processes a video reel through the TRIBE v2 brain encoder and saves:
  - raw/<CODE>.npz     — brain activation tensor (n_TRs, 20484)
  - transcripts/<CODE>.json — word-level transcript with timestamps
"""

import modal
import os
import json

app = modal.App("tribev2-poc")

# Modal volume for persisting outputs
volume = modal.Volume.from_name("tribev2-outputs", create_if_missing=True)

# Build the GPU image with all tribev2 dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    # Install CUDA-compatible torch + torchvision first
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu124",
    )
    # Install tribev2 + whisperx with constrained torch to prevent upgrades
    .run_commands(
        "printf 'torch==2.5.1\\ntorchvision==0.20.1+cu124\\n' > /tmp/c.txt",
        "PIP_CONSTRAINT=/tmp/c.txt pip install 'torchmetrics<1.7' 'tribev2[plotting] @ git+https://github.com/facebookresearch/tribev2.git'",
        "pip install --no-deps 'whisperx @ git+https://github.com/m-bain/whisperx.git'",
        "PIP_CONSTRAINT=/tmp/c.txt pip install 'faster-whisper>=1.2.0' 'ctranslate2>=4.5.0' 'pyannote-audio>=3.3,<4' nltk omegaconf",
    )
    .env({"HF_HOME": "/root/.cache/huggingface"})
)


@app.function(
    image=image,
    gpu="A10G",
    timeout=3600,
    secrets=[modal.Secret.from_name("huggingface")],
    volumes={"/outputs": volume},
)
def run_tribev2(video_bytes: bytes, code: str):
    """Run TRIBE v2 on a video and save outputs to the Modal volume."""
    import numpy as np
    import tempfile
    from pathlib import Path

    # Write video to temp file
    video_path = Path(tempfile.mktemp(suffix=".mp4"))
    video_path.write_bytes(video_bytes)

    # Load model
    from tribev2.demo_utils import TribeModel

    cache_folder = Path("/tmp/tribev2_cache")
    model = TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=str(cache_folder),
    )

    # Build events (this runs whisper transcription + feature extraction)
    print(f"Processing video: {video_path} ({len(video_bytes) / 1e6:.1f} MB)")
    df = model.get_events_dataframe(video_path=str(video_path))

    # Extract transcript info before prediction
    transcript_data = []
    word_rows = df[df["type"] == "Word"]
    for _, row in word_rows.iterrows():
        transcript_data.append({
            "word": row.get("text", ""),
            "start": float(row["start"]),
            "duration": float(row.get("duration", 0)),
            "end": float(row["start"]) + float(row.get("duration", 0)),
        })

    # Run prediction
    preds, segments = model.predict(events=df)
    print(f"Predictions shape: {preds.shape}")

    # Save outputs to Modal volume
    out_dir = Path(f"/outputs/{code}")
    raw_dir = out_dir / "raw"
    transcript_dir = out_dir / "transcripts"
    raw_dir.mkdir(parents=True, exist_ok=True)
    transcript_dir.mkdir(parents=True, exist_ok=True)

    # Save brain tensor
    npz_path = raw_dir / f"{code}.npz"
    np.savez_compressed(str(npz_path), brain_activations=preds)
    print(f"Saved brain tensor to {npz_path}")

    # Save transcript
    transcript_path = transcript_dir / f"{code}.json"
    transcript_path.write_text(json.dumps(transcript_data, indent=2))
    print(f"Saved transcript to {transcript_path}")

    # Save segment metadata
    segment_meta = []
    for i, seg in enumerate(segments):
        meta = {
            "index": i,
            "start": float(seg.start),
            "duration": float(seg.duration),
            "n_events": len(seg.ns_events),
        }
        segment_meta.append(meta)
    meta_path = out_dir / "segments.json"
    meta_path.write_text(json.dumps(segment_meta, indent=2))

    volume.commit()

    return {
        "code": code,
        "preds_shape": list(preds.shape),
        "n_words": len(transcript_data),
        "n_segments": len(segments),
    }


@app.local_entrypoint()
def main(reel: str, batch: str = ""):
    """Local entrypoint: process one reel or a batch of reels concurrently.

    Single reel:  modal run modal_tribev2.py --reel reels/CODE.mp4
    Batch:        modal run modal_tribev2.py --reel dummy --batch "reels/A.mp4,reels/B.mp4,..."
    """
    from pathlib import Path

    if batch:
        # Batch mode: process multiple reels concurrently via .map()
        reel_paths = [p.strip() for p in batch.split(",") if p.strip()]
        inputs = []
        for rp in reel_paths:
            video_path = Path(rp)
            if not video_path.exists():
                print(f"WARNING: Video not found, skipping: {video_path}")
                continue
            code = video_path.stem.replace("-10s", "")
            video_bytes = video_path.read_bytes()
            print(f"Uploading {video_path.name} ({len(video_bytes) / 1e6:.1f} MB)")
            inputs.append((video_bytes, code))

        if not inputs:
            print("No valid videos to process.")
            return

        print(f"\nDispatching {len(inputs)} reels to Modal ({len(inputs)} containers)...")
        bytes_list, codes_list = zip(*inputs)
        for result in run_tribev2.map(bytes_list, codes_list):
            print(f"  Done: {result['code']} — brain {result['preds_shape']}, "
                  f"{result['n_words']} words, {result['n_segments']} segments")

        print(f"\nAll {len(inputs)} reels complete.")
        print(f"Pull results with:")
        for _, code in inputs:
            print(f"  modal volume get tribev2-outputs {code} ./outputs/{code}")
    else:
        # Single reel mode (original behavior)
        video_path = Path(reel)
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        code = video_path.stem.replace("-10s", "")
        video_bytes = video_path.read_bytes()
        print(f"Uploading {video_path.name} ({len(video_bytes) / 1e6:.1f} MB) to Modal...")

        result = run_tribev2.remote(video_bytes, code)
        print(f"\nDone! Results:")
        print(f"  Brain tensor shape: {result['preds_shape']}")
        print(f"  Transcript words: {result['n_words']}")
        print(f"  Segments: {result['n_segments']}")
        print(f"\nPull results with:")
        print(f"  modal volume get tribev2-outputs {code} ./outputs/{code}")
