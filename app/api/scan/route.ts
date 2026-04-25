import { NextResponse } from "next/server";
import { createJob, findActiveJob } from "@/lib/server/jobs";
import { createAnalysisId, saveUploadedVideo } from "@/lib/server/media";
import { startPipeline } from "@/lib/server/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const activeJob = await findActiveJob();
    if (activeJob) {
      return NextResponse.json(
        {
          error: `Another scan is already running (${activeJob.id}). Wait for it to complete before starting a new one.`
        },
        { status: 409 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a video file." }, { status: 400 });
    }

    const id = createAnalysisId();
    const saved = await saveUploadedVideo(file, id);
    await createJob({
      id,
      originalFilename: file.name,
      durationSec: saved.durationSec
    });

    await startPipeline(id);

    return NextResponse.json({
      id,
      status: "queued"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
