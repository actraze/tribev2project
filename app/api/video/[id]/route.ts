import { stat, createReadStream } from "node:fs";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { reelPath, safeSegment } from "@/lib/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statAsync = promisify(stat);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const id = safeSegment(rawId);
    const filePath = reelPath(id);
    const fileStat = await statAsync(filePath);
    const range = request.headers.get("range");

    if (range) {
      const [startRaw, endRaw] = range.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(startRaw, 10);
      const end = endRaw ? Number.parseInt(endRaw, 10) : fileStat.size - 1;
      const chunkSize = end - start + 1;
      const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4"
        }
      });
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "Content-Length": String(fileStat.size),
        "Content-Type": "video/mp4"
      }
    });
  } catch {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }
}
