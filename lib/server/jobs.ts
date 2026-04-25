import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import type { JobRecord, PipelineStatus } from "@/lib/types";
import { jobPath, jobsDir } from "@/lib/server/paths";

export const activeStatuses: PipelineStatus[] = [
  "queued",
  "brain_encoding",
  "pulling_results",
  "extracting_features",
  "extracting_frames",
  "diagnosing",
  "briefing"
];

export const stepIndexByStatus: Record<PipelineStatus, number> = {
  queued: 0,
  brain_encoding: 1,
  pulling_results: 2,
  extracting_features: 3,
  extracting_frames: 4,
  diagnosing: 5,
  briefing: 6,
  completed: 7,
  failed: 0,
  failed_restart_required: 0
};

export const stepLabels: Record<PipelineStatus, string> = {
  queued: "Upload accepted",
  brain_encoding: "Brain encoding on Modal GPU",
  pulling_results: "Pulling Modal results",
  extracting_features: "Extracting neural features",
  extracting_frames: "Extracting keyframes",
  diagnosing: "Running multimodal diagnosis",
  briefing: "Generating creator brief",
  completed: "Analysis complete",
  failed: "Pipeline failed",
  failed_restart_required: "Server restarted during job"
};

export async function ensureJobDirs() {
  await mkdir(jobsDir, { recursive: true });
}

export async function readJob(id: string): Promise<JobRecord | null> {
  try {
    const raw = await readFile(jobPath(id), "utf8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function writeJob(job: JobRecord) {
  await ensureJobDirs();
  await writeFile(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`);
}

export async function createJob(input: {
  id: string;
  originalFilename: string;
  durationSec: number;
}) {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: input.id,
    status: "queued",
    stepIndex: 0,
    stepLabel: stepLabels.queued,
    originalFilename: input.originalFilename,
    durationSec: input.durationSec,
    createdAt: now,
    updatedAt: now
  };
  await writeJob(job);
  return job;
}

export async function updateJob(id: string, patch: Partial<JobRecord>) {
  const current = await readJob(id);
  if (!current) return;
  const status = patch.status ?? current.status;
  const next: JobRecord = {
    ...current,
    ...patch,
    status,
    stepIndex: patch.stepIndex ?? stepIndexByStatus[status],
    stepLabel: patch.stepLabel ?? stepLabels[status],
    updatedAt: new Date().toISOString()
  };
  if (status === "completed" && !next.completedAt) {
    next.completedAt = next.updatedAt;
  }
  await writeJob(next);
}

export async function findActiveJob() {
  await ensureJobDirs();
  const files = await readdir(jobsDir).catch(() => []);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -5);
    const job = await readJob(id);
    if (job && activeStatuses.includes(job.status)) {
      return job;
    }
  }
  return null;
}
