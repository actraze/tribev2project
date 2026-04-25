export type PipelineStatus =
  | "queued"
  | "brain_encoding"
  | "pulling_results"
  | "extracting_features"
  | "extracting_frames"
  | "diagnosing"
  | "briefing"
  | "completed"
  | "failed"
  | "failed_restart_required";

export type JobRecord = {
  id: string;
  status: PipelineStatus;
  stepIndex: number;
  stepLabel: string;
  originalFilename: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  durationSec?: number;
};

export type TranscriptWord = {
  word: string;
  start: number;
  duration: number;
  end: number;
};

export type RegionActivations = Record<string, number>;

export type FeatureWindow = {
  window_index: number;
  start_time: number;
  end_time: number;
  mean_activation: number;
  dominant_region: string;
  region_activations: RegionActivations;
  words?: string[];
};

export type FeaturesPayload = {
  code: string;
  n_trs: number;
  total_duration_sec: number;
  windows: FeatureWindow[];
  overall?: {
    mean_activation?: number;
    trend?: string;
    peak_timestamp_sec?: number;
    region_activations?: RegionActivations;
  };
};

export type ResultsPayload = {
  id: string;
  demo: boolean;
  videoUrl: string;
  frames: string[];
  features: FeaturesPayload;
  transcript: TranscriptWord[];
  diagnosis: string;
  brief: string;
  metadata: {
    durationSec: number;
    frameCount: number;
    createdAt?: string;
    originalFilename?: string;
  };
};
