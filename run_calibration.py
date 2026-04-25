#!/usr/bin/env python3
"""
Calibration sprint: process reels from CSV through the brain pipeline.
Uses Modal Python SDK directly to .map() all reels onto concurrent GPUs.

Usage:
  python3 run_calibration.py                    # Process all 16 reels
  python3 run_calibration.py --batch 1           # Process reels 1-8 (first half)
  python3 run_calibration.py --batch 2           # Process reels 9-16 (second half)
  python3 run_calibration.py --batch 1 --modal-env ~/.modal2.toml

Skips diagnosis/brief — only collects brain data + frames for calibration.
"""

import csv
import json
import subprocess
import sys
import os
import re
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor


def extract_code(url):
    """Extract reel code from Instagram URL."""
    match = re.search(r"/reels?/([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="calibration_reels.csv")
    parser.add_argument("--batch", type=int, choices=[1, 2], help="Run batch 1 (first half) or 2 (second half)")
    parser.add_argument("--modal-env", help="Modal config path override (for second account)")
    args = parser.parse_args()

    # Set Modal config before importing modal
    if args.modal_env:
        os.environ["MODAL_CONFIG_PATH"] = args.modal_env

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"Error: CSV not found: {csv_path}")
        sys.exit(1)

    # Read CSV
    reels = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = row["URL"].strip()
            url = url.replace("/reels/", "/reel/")
            url = url.rstrip("/")
            code = extract_code(url)
            if code:
                reels.append({
                    "code": code,
                    "url": url,
                    "category": row["Category"].strip(),
                    "industry": row["Industry/Category"].strip(),
                    "performance": row["Performance Overall"].strip(),
                    "views": row["Views"].strip(),
                    "likes": row["Likes"].strip(),
                    "comments": row["Comments"].strip(),
                })

    # Split into batches if requested
    if args.batch == 1:
        mid = len(reels) // 2
        reels = reels[:mid]
        print(f"Batch 1: processing reels 1-{mid}")
    elif args.batch == 2:
        mid = len(reels) // 2
        reels = reels[mid:]
        print(f"Batch 2: processing reels {mid+1}-{len(reels)+mid}")

    modal_bin = "/Library/Frameworks/Python.framework/Versions/3.11/bin/modal"
    modal_prefix = ""
    if args.modal_env:
        os.environ["MODAL_CONFIG_PATH"] = args.modal_env
        modal_prefix = f"MODAL_CONFIG_PATH={args.modal_env} "

    total = len(reels)
    print(f"{'='*50}")
    print(f"  TRIBE v2 Calibration Sprint")
    print(f"  Processing {total} reels")
    print(f"{'='*50}\n")

    failed = []
    skipped = []
    processed = []

    # --- Phase 1: Filter already-done, download missing ---
    print("Phase 1: Checking & downloading reels...")
    to_process = []
    for reel in reels:
        code = reel["code"]
        if Path(f"outputs/{code}/features.json").exists():
            print(f"  {code} — already processed, skipping.")
            skipped.append(code)
            continue
        if not Path(f"reels/{code}.mp4").exists():
            print(f"  {code} — downloading...")
            result = subprocess.run(
                f'node download_reel.mjs "{reel["url"]}"',
                shell=True, capture_output=True, text=True,
            )
            if result.returncode != 0:
                print(f"  {code} — FAILED to download")
                failed.append(code)
                continue
        to_process.append(reel)

    if not to_process:
        print("\nNo reels to process.")
        _save_metadata(reels)
        return

    # --- Phase 2: Run TRIBE v2 on ALL reels via Modal CLI with .map() ---
    n = len(to_process)
    print(f"\nPhase 2: Running TRIBE v2 on {n} reels ({n} concurrent GPUs via .map())...")

    # Build comma-separated reel paths for --batch flag
    # modal_tribev2.py's main() entrypoint handles .map() internally
    reel_paths = ",".join(f"reels/{r['code']}.mp4" for r in to_process)
    modal_failed = set()
    modal_result = subprocess.run(
        f'{modal_prefix}{modal_bin} run modal_tribev2.py --reel dummy --batch "{reel_paths}"',
        shell=True,
    )
    if modal_result.returncode != 0:
        print("  FATAL: Modal batch run failed.")
        failed.extend(r["code"] for r in to_process)
        _save_metadata(reels)
        return

    print(f"\n  All {n} Modal jobs complete.")

    # --- Phase 3: Pull all results from Modal volume ---
    print(f"\nPhase 3: Pulling results from Modal volume...")
    Path("outputs").mkdir(exist_ok=True)
    for reel in to_process:
        code = reel["code"]
        result = subprocess.run(
            f'{modal_prefix}{modal_bin} volume get tribev2-outputs "{code}" "./outputs/" --force',
            shell=True, capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  {code} — FAILED to pull")
            failed.append(code)
            modal_failed.add(code)
        else:
            print(f"  {code} — pulled.")

    # --- Phase 4: Local post-processing (features + frames) ---
    print(f"\nPhase 4: Extracting features + frames...")
    pulled = [r for r in to_process if r["code"] not in modal_failed]

    def postprocess(reel):
        code = reel["code"]
        r1 = subprocess.run(f'python3 extract_features.py "{code}"', shell=True, capture_output=True, text=True)
        if r1.returncode != 0:
            return code, False
        r2 = subprocess.run(f'python3 extract_frames.py "{code}"', shell=True, capture_output=True, text=True)
        if r2.returncode != 0:
            return code, False
        return code, True

    with ThreadPoolExecutor(max_workers=8) as executor:
        for code, ok in executor.map(postprocess, pulled):
            if ok:
                print(f"  {code} — done!")
                processed.append(code)
            else:
                print(f"  {code} — FAILED post-processing")
                failed.append(code)

    # --- Summary ---
    print(f"\n{'='*50}")
    print(f"  Calibration Batch Complete")
    print(f"  Processed: {len(processed)}")
    print(f"  Skipped (already done): {len(skipped)}")
    if failed:
        print(f"  Failed: {len(failed)} — {', '.join(failed)}")
    print(f"{'='*50}")

    _save_metadata(reels)

    if not args.batch:
        print("Building calibration table...")
        subprocess.run(["python3", "build_calibration.py"])
    else:
        print(f"\nBatch {args.batch} done. When both batches finish, run:")
        print("  python3 build_calibration.py")


def _save_metadata(reels):
    """Save reel metadata for build_calibration.py."""
    meta_path = Path("outputs/calibration_meta.json")
    existing = []
    if meta_path.exists():
        existing = json.loads(meta_path.read_text())
    existing_codes = {r["code"] for r in existing}
    for reel in reels:
        if reel["code"] not in existing_codes:
            existing.append(reel)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(existing, indent=2))
    print(f"\nMetadata saved to {meta_path}")


if __name__ == "__main__":
    main()
