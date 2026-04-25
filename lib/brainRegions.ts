import type { FeatureWindow, RegionActivations } from "@/lib/types";

export const brainRegionOrder = [
  "visual_cortex",
  "auditory_cortex",
  "heschls_gyrus",
  "brocas_area",
  "sts",
  "prefrontal",
  "motor_cortex"
] as const;

export type BrainRegionKey = (typeof brainRegionOrder)[number];

export const brainRegionColors: Record<BrainRegionKey, string> = {
  visual_cortex: "#00f2ff",
  auditory_cortex: "#f59e0b",
  heschls_gyrus: "#ff6b75",
  brocas_area: "#9d05ff",
  sts: "#10b981",
  prefrontal: "#74f5ff",
  motor_cortex: "#f97316"
};

export const brainRegionLabels: Record<BrainRegionKey, string> = {
  visual_cortex: "Visual",
  auditory_cortex: "Audio",
  heschls_gyrus: "Speech",
  brocas_area: "Language",
  sts: "Social",
  prefrontal: "Attention",
  motor_cortex: "Action"
};

export const brainRegionDescriptions: Record<BrainRegionKey, string> = {
  visual_cortex: "visual processing",
  auditory_cortex: "sound and music processing",
  heschls_gyrus: "speech perception",
  brocas_area: "language comprehension",
  sts: "social and face processing",
  prefrontal: "attention and decision-making",
  motor_cortex: "movement and action response"
};

const empiricalActivationScale = {
  p0: -0.1053,
  p25: -0.0042,
  p50: 0.0241,
  p75: 0.0562,
  p90: 0.0929,
  p95: 0.1158,
  max: 0.1946
};

export function isBrainRegionKey(region: string): region is BrainRegionKey {
  return brainRegionOrder.includes(region as BrainRegionKey);
}

export function formatBrainRegion(region: string) {
  return isBrainRegionKey(region) ? brainRegionLabels[region] : region.replace(/_/g, " ");
}

export function getBrainRegionColor(region: string) {
  return isBrainRegionKey(region) ? brainRegionColors[region] : "#ffffff";
}

export type NormalizedActivation = {
  rawValue: number;
  normalizedIntensity: number;
  label: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRegionActivation(
  window: FeatureWindow | undefined,
  region: string,
  allActivations?: RegionActivations[]
): NormalizedActivation {
  const rawValue = Number(window?.region_activations?.[region] ?? 0);
  const calibrated = clamp((rawValue - empiricalActivationScale.p0) / (empiricalActivationScale.p95 - empiricalActivationScale.p0));

  let local = calibrated;
  if (allActivations?.length) {
    const values = allActivations
      .map((activations) => activations[region])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
      local = clamp((rawValue - min) / (max - min));
    }
  }

  const normalizedIntensity = clamp(local * 0.35 + calibrated * 0.65);
  const label =
    rawValue >= empiricalActivationScale.p95 ? "P95+" :
    rawValue >= empiricalActivationScale.p90 ? "P90" :
    rawValue >= empiricalActivationScale.p75 ? "P75" :
    rawValue >= empiricalActivationScale.p50 ? "P50" :
    rawValue >= empiricalActivationScale.p25 ? "P25" :
    "baseline";

  return {
    rawValue,
    normalizedIntensity,
    label
  };
}
