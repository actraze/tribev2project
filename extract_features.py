#!/usr/bin/env python3
"""
Extract time-sliced brain activation features from TRIBE v2 output.

Takes a .npz file containing a brain activation tensor (n_TRs, 20484)
and produces a structured JSON with per-window and overall metrics.

Usage: python extract_features.py <CODE>
"""

import sys
import json
import numpy as np
from pathlib import Path

# Approximate vertex index ranges for fsaverage5 (20484 total vertices).
# fsaverage5 has 10242 vertices per hemisphere. These ranges are approximate
# mappings based on the FreeSurfer fsaverage5 atlas parcellation.
#
# Assumptions:
# - Vertices 0-10241: left hemisphere
# - Vertices 10242-20483: right hemisphere
# - Within each hemisphere, vertex ordering follows FreeSurfer convention
#
# Region boundaries are approximate and based on typical fsaverage5 parcellations.
BRAIN_REGIONS = {
    "visual_cortex": {
        "description": "Primary and secondary visual cortex (V1/V2, occipital)",
        "vertex_ranges": [(0, 1200), (10242, 11442)],  # occipital pole, both hemispheres
    },
    "auditory_cortex": {
        "description": "Primary auditory cortex (A1, superior temporal)",
        "vertex_ranges": [(3500, 4200), (13742, 14442)],
    },
    "heschls_gyrus": {
        "description": "Heschl's gyrus (transverse temporal gyrus)",
        "vertex_ranges": [(3800, 4100), (14042, 14342)],
    },
    "brocas_area": {
        "description": "Broca's area (inferior frontal gyrus, speech production)",
        "vertex_ranges": [(6500, 7200), (16742, 17442)],  # left-dominant but bilateral
    },
    "sts": {
        "description": "Superior temporal sulcus (social cognition, language)",
        "vertex_ranges": [(3200, 4500), (13442, 14742)],
    },
    "prefrontal": {
        "description": "Prefrontal cortex (executive function, attention)",
        "vertex_ranges": [(7500, 9000), (17742, 19242)],
    },
    "motor_cortex": {
        "description": "Primary motor cortex (precentral gyrus)",
        "vertex_ranges": [(5500, 6500), (15742, 16742)],
    },
}


def get_region_vertices(region_name):
    """Return flat array of vertex indices for a named brain region."""
    region = BRAIN_REGIONS[region_name]
    indices = []
    for start, end in region["vertex_ranges"]:
        indices.extend(range(start, end))
    return np.array(indices)


def get_dominant_region(activation_slice):
    """Find which brain region has the highest mean activation."""
    best_region = None
    best_activation = -np.inf
    region_activations = {}

    for region_name in BRAIN_REGIONS:
        vertices = get_region_vertices(region_name)
        vertices = vertices[vertices < len(activation_slice)]
        if len(vertices) == 0:
            continue
        mean_act = float(np.mean(activation_slice[vertices]))
        region_activations[region_name] = mean_act
        if mean_act > best_activation:
            best_activation = mean_act
            best_region = region_name

    return best_region, region_activations


def extract_features(npz_path, code):
    """Extract time-sliced features from a TRIBE v2 .npz output."""
    data = np.load(npz_path)

    # Find the tensor key
    keys = list(data.files)
    print(f"NPZ keys: {keys}")

    # Try known keys, fall back to first
    tensor = None
    for key in ["brain_activations", "arr_0", "preds"]:
        if key in keys:
            tensor = data[key]
            print(f"Using key: '{key}'")
            break
    if tensor is None:
        tensor = data[keys[0]]
        print(f"Using first key: '{keys[0]}'")

    n_trs, n_vertices = tensor.shape
    print(f"Tensor shape: ({n_trs}, {n_vertices})")
    print(f"  n_TRs (seconds): {n_trs}")
    print(f"  n_vertices: {n_vertices}")

    # TRIBE v2 outputs 1 TR per second
    tr_duration = 1.0  # seconds
    window_size = 2  # seconds (2 TRs per window)

    windows = []
    for i in range(0, n_trs, window_size):
        end = min(i + window_size, n_trs)
        window_data = tensor[i:end]
        mean_activation = float(np.mean(window_data))
        window_mean = np.mean(window_data, axis=0)  # average across TRs in window

        # Compute per-window metrics
        dominant_region, region_activations = get_dominant_region(window_mean)
        fire_mask = window_mean > 0.5
        n_fire = int(np.sum(fire_mask))

        window_info = {
            "window_index": len(windows),
            "start_time": round(i * tr_duration, 1),
            "end_time": round(end * tr_duration, 1),
            "n_trs": end - i,
            "mean_activation": round(mean_activation, 6),
            "max_activation": round(float(np.max(window_data)), 6),
            "min_activation": round(float(np.min(window_data)), 6),
            "std_activation": round(float(np.std(window_data)), 6),
            "fire_vertices": n_fire,
            "fire_vertices_pct": round(100 * n_fire / n_vertices, 2),
            "dominant_region": dominant_region,
            "region_activations": {k: round(v, 6) for k, v in region_activations.items()},
        }
        windows.append(window_info)

    # Overall metrics
    overall_mean = float(np.mean(tensor))
    half = n_trs // 2
    first_half_mean = float(np.mean(tensor[:half]))
    second_half_mean = float(np.mean(tensor[half:]))
    trend = "rising" if second_half_mean > first_half_mean else "falling"

    # Peak timestamp
    tr_means = np.mean(tensor, axis=1)
    peak_tr = int(np.argmax(tr_means))
    peak_activation = tensor[peak_tr]
    peak_fire = int(np.sum(peak_activation > 0.5))

    # Overall region breakdown
    _, overall_region_activations = get_dominant_region(np.mean(tensor, axis=0))

    # Load transcript if available
    transcript = None
    transcript_path = Path(f"outputs/{code}/transcripts/{code}.json")
    if transcript_path.exists():
        transcript = json.loads(transcript_path.read_text())
        print(f"Loaded transcript: {len(transcript)} words")

        # Align words to windows
        for window in windows:
            window["words"] = []
            for word in transcript:
                word_mid = word["start"] + word["duration"] / 2
                if window["start_time"] <= word_mid < window["end_time"]:
                    window["words"].append(word["word"])
    else:
        print(f"No transcript found at {transcript_path}")

    features = {
        "code": code,
        "n_trs": n_trs,
        "n_vertices": n_vertices,
        "tr_duration_sec": tr_duration,
        "total_duration_sec": round(n_trs * tr_duration, 1),
        "window_size_sec": window_size,
        "windows": windows,
        "overall": {
            "mean_activation": round(overall_mean, 6),
            "first_half_mean": round(first_half_mean, 6),
            "second_half_mean": round(second_half_mean, 6),
            "trend": trend,
            "peak_timestamp_sec": round(peak_tr * tr_duration, 1),
            "peak_mean_activation": round(float(tr_means[peak_tr]), 6),
            "peak_fire_vertices": peak_fire,
            "region_activations": {k: round(v, 6) for k, v in overall_region_activations.items()},
        },
        "transcript": transcript,
        "brain_regions": {
            name: info["description"] for name, info in BRAIN_REGIONS.items()
        },
    }

    return features


def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_features.py <CODE>")
        sys.exit(1)

    code = sys.argv[1]
    npz_path = Path(f"outputs/{code}/raw/{code}.npz")

    if not npz_path.exists():
        print(f"Error: {npz_path} not found")
        sys.exit(1)

    features = extract_features(str(npz_path), code)

    # Save
    out_path = Path(f"outputs/{code}/features.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(features, indent=2))
    print(f"\nSaved features to {out_path}")

    # Print to stdout
    print("\n" + "=" * 60)
    print(json.dumps(features, indent=2))


if __name__ == "__main__":
    main()
