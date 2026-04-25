import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readJob } from "@/lib/server/jobs";
import { outputDir, safeSegment } from "@/lib/server/paths";
import type { ResultsPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readTextOptional(filePath: string) {
  return readFile(filePath, "utf8").catch(() => "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = safeSegment(rawId);
    const dir = outputDir(id);
    const featuresPath = path.join(dir, "features.json");
    const transcriptPath = path.join(dir, "transcripts", `${id}.json`);
    const framesDir = path.join(dir, "frames");

    const features = await readJson<ResultsPayload["features"]>(featuresPath);
    const transcript = await readJson<ResultsPayload["transcript"]>(transcriptPath).catch(() => []);
    const diagnosis = await readTextOptional(path.join(dir, "diagnosis.txt"));
    const brief = await readTextOptional(path.join(dir, "brief.txt"));
    const frameFiles = (await readdir(framesDir).catch(() => []))
      .filter((file) => /^frame_\d+\.jpg$/.test(file))
      .sort();
    const job = await readJob(id);

    const payload: ResultsPayload = {
      id,
      demo: id === (process.env.DEMO_ANALYSIS_ID ?? "DVj0HP6CQOP"),
      videoUrl: `/api/video/${id}`,
      frames: frameFiles.map((file) => `/api/frames/${id}/${file}`),
      features,
      transcript,
      diagnosis,
      brief,
      metadata: {
        durationSec: Number(features.total_duration_sec ?? job?.durationSec ?? 0),
        frameCount: frameFiles.length,
        createdAt: job?.createdAt,
        originalFilename: job?.originalFilename
      }
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Results are not available yet for this analysis." },
      { status: 404 }
    );
  }
}
