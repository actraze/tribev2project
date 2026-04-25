import { NextResponse } from "next/server";
import { readJob } from "@/lib/server/jobs";
import { safeSegment } from "@/lib/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = safeSegment(rawId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let interval: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      function close() {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        controller.close();
      }

      async function send() {
        const job = await readJob(id);
        if (!job) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Job not found" })}\n\n`));
          close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));

        if (job.status === "completed" || job.status === "failed" || job.status === "failed_restart_required") {
          close();
        }
      }

      await send();
      if (closed) return;
      interval = setInterval(() => {
        send().catch(() => {
          close();
        });
      }, 1500);
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
