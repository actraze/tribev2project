import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { outputDir, safeSegment } from "@/lib/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  try {
    const { id: rawId, file: rawFile } = await params;
    const id = safeSegment(rawId);
    const file = safeSegment(rawFile);
    if (!/^frame_\d+\.jpg$/.test(file)) {
      return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
    }
    const bytes = await readFile(path.join(outputDir(id), "frames", file));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Frame not found." }, { status: 404 });
  }
}
