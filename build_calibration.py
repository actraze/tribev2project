#!/usr/bin/env python3
"""
Build calibration table from processed reels.
Reads all features.json files + calibration metadata to compute
per-category activation baselines and high-vs-low performer comparison.

Usage: python3 build_calibration.py
"""

import json
import sys
import numpy as np
from pathlib import Path


def parse_views(s):
    """Parse views string like '19.4k', '16.1M', '3500000' to int."""
    s = s.strip().replace(",", "")
    if s.lower().endswith("m"):
        return int(float(s[:-1]) * 1_000_000)
    elif s.lower().endswith("k"):
        return int(float(s[:-1]) * 1_000)
    else:
        return int(float(s))


def stats_block(vals):
    """Compute summary stats for a list of floats."""
    return {
        "min": round(min(vals), 6),
        "max": round(max(vals), 6),
        "mean": round(float(np.mean(vals)), 6),
        "std": round(float(np.std(vals)), 6),
        "p25": round(float(np.percentile(vals, 25)), 6),
        "p50": round(float(np.percentile(vals, 50)), 6),
        "p75": round(float(np.percentile(vals, 75)), 6),
    }


def main():
    meta_path = Path("outputs/calibration_meta.json")
    if not meta_path.exists():
        print("Error: outputs/calibration_meta.json not found.")
        print("Run run_calibration.py first.")
        sys.exit(1)

    reels = json.loads(meta_path.read_text())

    # Load features for each reel
    results = []
    for reel in reels:
        code = reel["code"]
        features_path = Path(f"outputs/{code}/features.json")
        if not features_path.exists():
            print(f"  Skipping {code} — no features.json")
            continue

        features = json.loads(features_path.read_text())

        results.append({
            "code": code,
            "category": reel["category"],
            "industry": reel["industry"],
            "performance": reel["performance"],
            "views": parse_views(reel["views"]),
            "likes": parse_views(reel["likes"]),
            "comments": parse_views(reel["comments"]),
            "duration_sec": features["total_duration_sec"],
            "overall_mean": features["overall"]["mean_activation"],
            "peak_mean": features["overall"]["peak_mean_activation"],
            "trend": features["overall"]["trend"],
            "regions": features["overall"]["region_activations"],
        })

    if not results:
        print("No results found. Process reels first with run_calibration.py.")
        sys.exit(1)

    print(f"\nLoaded {len(results)} reels\n")

    # --- Global stats ---
    all_means = [r["overall_mean"] for r in results]
    all_peaks = [r["peak_mean"] for r in results]
    region_names = list(results[0]["regions"].keys())

    global_stats = {
        "n_reels": len(results),
        "overall_mean": stats_block(all_means),
        "peak_mean": stats_block(all_peaks),
        "regions": {
            region: stats_block([r["regions"][region] for r in results if region in r["regions"]])
            for region in region_names
        },
    }

    # --- Per-category stats ---
    categories = {}
    for r in results:
        cat = r["category"]
        categories.setdefault(cat, []).append(r)

    category_stats = {}
    for cat, cat_reels in categories.items():
        cat_means = [r["overall_mean"] for r in cat_reels]
        cat_peaks = [r["peak_mean"] for r in cat_reels]

        cat_stat = {
            "n_reels": len(cat_reels),
            "codes": [r["code"] for r in cat_reels],
            "overall_mean": stats_block(cat_means) if len(cat_means) > 1 else {"mean": round(float(np.mean(cat_means)), 6)},
            "peak_mean": stats_block(cat_peaks) if len(cat_peaks) > 1 else {"mean": round(float(np.mean(cat_peaks)), 6)},
            "regions": {
                region: {"mean": round(float(np.mean([r["regions"][region] for r in cat_reels if region in r["regions"]])), 6)}
                for region in region_names
            },
        }

        # Performance breakdown within category
        perf_breakdown = {}
        for r in cat_reels:
            perf = "high" if "Good" in r["performance"] or "Outlier" in r["performance"] else "low"
            perf_breakdown.setdefault(perf, []).append({
                "code": r["code"],
                "overall_mean": r["overall_mean"],
                "peak_mean": r["peak_mean"],
                "views": r["views"],
            })
        cat_stat["performance_breakdown"] = perf_breakdown

        category_stats[cat] = cat_stat

    # --- High vs low performer comparison ---
    high_performers = [r for r in results if "Good" in r["performance"] or "Outlier" in r["performance"]]
    low_performers = [r for r in results if "Low" in r["performance"]]

    performance_comparison = {}
    if high_performers and low_performers:
        high_means = [r["overall_mean"] for r in high_performers]
        low_means = [r["overall_mean"] for r in low_performers]
        high_peaks = [r["peak_mean"] for r in high_performers]
        low_peaks = [r["peak_mean"] for r in low_performers]

        performance_comparison = {
            "high_performers": {
                "n": len(high_performers),
                "mean_activation": round(float(np.mean(high_means)), 6),
                "std_activation": round(float(np.std(high_means)), 6),
                "mean_peak": round(float(np.mean(high_peaks)), 6),
            },
            "low_performers": {
                "n": len(low_performers),
                "mean_activation": round(float(np.mean(low_means)), 6),
                "std_activation": round(float(np.std(low_means)), 6),
                "mean_peak": round(float(np.mean(low_peaks)), 6),
            },
            "separation": round(float(np.mean(high_means) - np.mean(low_means)), 6),
            "region_separation": {
                region: {
                    "high_mean": round(float(np.mean([r["regions"][region] for r in high_performers if region in r["regions"]])), 6),
                    "low_mean": round(float(np.mean([r["regions"][region] for r in low_performers if region in r["regions"]])), 6),
                    "separation": round(
                        float(np.mean([r["regions"][region] for r in high_performers if region in r["regions"]]))
                        - float(np.mean([r["regions"][region] for r in low_performers if region in r["regions"]])),
                        6,
                    ),
                }
                for region in region_names
            },
        }

    # --- Compute per-window region percentiles (what the LLM actually sees) ---
    all_region_vals = []
    for reel in reels:
        code = reel["code"]
        features_path = Path(f"outputs/{code}/features.json")
        if not features_path.exists():
            continue
        features = json.loads(features_path.read_text())
        for window in features["windows"]:
            for region, val in window["region_activations"].items():
                all_region_vals.append(val)

    all_region_vals = np.array(all_region_vals)
    percentiles = {
        "p0": round(float(np.percentile(all_region_vals, 0)), 4),
        "p10": round(float(np.percentile(all_region_vals, 10)), 4),
        "p25": round(float(np.percentile(all_region_vals, 25)), 4),
        "p50": round(float(np.percentile(all_region_vals, 50)), 4),
        "p75": round(float(np.percentile(all_region_vals, 75)), 4),
        "p90": round(float(np.percentile(all_region_vals, 90)), 4),
        "p95": round(float(np.percentile(all_region_vals, 95)), 4),
        "max": round(float(np.max(all_region_vals)), 4),
    }

    # --- Build prompt block ---
    # Find concrete examples of high-activation low-performers and vice versa
    high_example = None
    low_example = None
    for r in results:
        is_high = "Good" in r["performance"] or "Outlier" in r["performance"]
        if is_high and (low_example is None or r["overall_mean"] < low_example["overall_mean"]):
            low_example = r  # high performer with LOW activation
        if not is_high and (high_example is None or r["overall_mean"] > high_example["overall_mean"]):
            high_example = r  # low performer with HIGH activation

    examples_text = ""
    if high_example and low_example:
        examples_text = (
            f"In our calibration set, a low-performing reel ({high_example['views']:,} views) had "
            f"mean={high_example['overall_mean']:.3f} while a viral reel ({low_example['views']:,} views) had "
            f"mean={low_example['overall_mean']:.3f}."
        )

    prompt_block = f"""\
## Activation Scale (empirical, from {len(results)} calibration reels across 4 content types)

| Percentile | Region activation value | Interpretation |
|---|---|---|
| P0 (floor) | {percentiles['p0']} | Suppression / inhibition |
| P25 | {percentiles['p25']} | Below baseline |
| P50 (median) | {percentiles['p50']} | Typical |
| P75 | {percentiles['p75']} | Above average |
| P90 | {percentiles['p90']} | High |
| P95 | {percentiles['p95']} | Very high |
| Max observed | {percentiles['max']} | Ceiling of TRIBE v2 output |

CRITICAL: Absolute activation magnitude does NOT predict real-world engagement. \
In our calibration set, low-performing reels (200–34K views) frequently showed HIGHER \
mean activation than viral reels (1M–12M views). {examples_text}

What DOES matter for your diagnosis:
1. RELATIVE patterns — which seconds spike vs dip within THIS reel
2. REGIONAL signatures — which brain regions dominate at each moment and what that implies
3. TEMPORAL dynamics — trend direction, buildup/decay, whether peaks align with key content moments
4. Use the percentile table above to characterize where values fall in TRIBE v2's output range — NOT to judge engagement quality"""

    # --- Assemble calibration table ---
    calibration = {
        "description": "TRIBE v2 calibration table — empirical activation ranges across content types",
        "global_stats": global_stats,
        "category_stats": category_stats,
        "performance_comparison": performance_comparison,
        "percentiles": percentiles,
        "prompt_block": prompt_block,
        "reels": results,
    }

    out_path = Path("outputs/calibration.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(calibration, indent=2))
    print(f"Calibration table saved to {out_path}")

    # --- Print summary ---
    print(f"\n{'='*60}")
    print(f"CALIBRATION SUMMARY")
    print(f"{'='*60}")
    print(f"\nGlobal activation range: {global_stats['overall_mean']['min']:.6f} — {global_stats['overall_mean']['max']:.6f}")
    print(f"Global peak range:       {global_stats['peak_mean']['min']:.6f} — {global_stats['peak_mean']['max']:.6f}")
    print(f"\nPer-category means:")
    for cat, s in category_stats.items():
        mean = s["overall_mean"]["mean"]
        std = s["overall_mean"].get("std", 0)
        print(f"  {cat}: {mean:.6f} (±{std:.6f}), n={s['n_reels']}")

    if performance_comparison:
        print(f"\nHigh vs Low performers:")
        hp = performance_comparison["high_performers"]
        lp = performance_comparison["low_performers"]
        print(f"  High: {hp['mean_activation']:.6f} (n={hp['n']})")
        print(f"  Low:  {lp['mean_activation']:.6f} (n={lp['n']})")
        print(f"  Separation: {performance_comparison['separation']:.6f}")

        print(f"\n  Region separation (high - low):")
        for region, rs in performance_comparison["region_separation"].items():
            direction = "+" if rs["separation"] > 0 else ""
            print(f"    {region}: {direction}{rs['separation']:.6f}")

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
