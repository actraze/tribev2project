import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { reelPath, reelsDir } from "@/lib/server/paths";

const execFileAsync = promisify(execFile);

const allowedExtensions = new Set([".mp4", ".mov", ".webm"]);

export function maxUploadMb() {
  return Number(process.env.MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 150);
}

export function maxVideoSeconds() {
  return Number(process.env.MAX_VIDEO_SECONDS ?? 30);
}

export function createAnalysisId() {
  return randomUUID();
}

export function validateUploadName(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw new Error("Upload an MP4, MOV, or WebM video.");
  }
  return ext;
}

export async function probeDuration(videoPath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration)) {
    throw new Error("Could not read video duration.");
  }
  return duration;
}

export async function saveUploadedVideo(file: File, id: string) {
  const ext = validateUploadName(file.name);
  const maxBytes = maxUploadMb() * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`Keep uploads under ${maxUploadMb()} MB.`);
  }

  await mkdir(reelsDir, { recursive: true });
  const finalPath = reelPath(id);
  const tempPath = path.join(reelsDir, `${id}.upload${ext}`);
  await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

  try {
    const duration = await probeDuration(tempPath);
    if (duration >= maxVideoSeconds()) {
      throw new Error(`Video must be less than ${maxVideoSeconds()} seconds. This file is ${duration.toFixed(1)} seconds.`);
    }

    if (ext === ".mp4") {
      await rename(tempPath, finalPath);
    } else {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        tempPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        finalPath
      ]);
      await unlink(tempPath).catch(() => undefined);
    }

    return {
      path: finalPath,
      durationSec: duration
    };
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    await unlink(finalPath).catch(() => undefined);
    throw error;
  }
}
