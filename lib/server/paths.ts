import path from "node:path";

export const rootDir = process.cwd();
export const reelsDir = path.join(rootDir, "reels");
export const outputsDir = path.join(rootDir, "outputs");
export const dataDir = path.join(rootDir, "data");
export const jobsDir = path.join(dataDir, "jobs");

export function reelPath(id: string) {
  return path.join(reelsDir, `${id}.mp4`);
}

export function outputDir(id: string) {
  return path.join(outputsDir, id);
}

export function jobPath(id: string) {
  return path.join(jobsDir, `${id}.json`);
}

export function jobLogPath(id: string) {
  return path.join(jobsDir, `${id}.log`);
}

export function safeSegment(value: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("Invalid path segment.");
  }
  return value;
}
