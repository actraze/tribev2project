"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileVideo, Loader2, UploadCloud } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";

const acceptedTypes = ["video/mp4", "video/quicktime", "video/webm"];
const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 150);

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function chooseFile(candidate?: File) {
    setError("");
    if (!candidate) return;
    if (!acceptedTypes.includes(candidate.type)) {
      setError("Upload an MP4, MOV, or WebM video.");
      setFile(null);
      return;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      setError(`Keep the file under ${maxMb} MB.`);
      setFile(null);
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file || isSubmitting) return;
    setError("");
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }
      router.push(`/processing/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel relative w-full overflow-hidden rounded-lg p-5 md:p-8">
      <div className="mb-8 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <StatusPill>System Input / Scan</StatusPill>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white">Upload video</h1>
        </div>
        <span className="hidden font-display text-xs uppercase tracking-[0.18em] text-zinc-600 md:block">Node 0x8F2A</span>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          chooseFile(event.dataTransfer.files[0]);
        }}
        className={`relative flex min-h-[300px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition ${
          isDragging || file
            ? "border-cyan bg-cyan/10 shadow-cyan"
            : "border-cyan/35 bg-black/45 hover:border-cyan hover:bg-cyan/5"
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-cyan/70 opacity-0 shadow-cyan transition group-hover:opacity-100" />
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <div className="relative mb-6">
          <FileVideo className="h-20 w-20 text-cyan/30" />
          <UploadCloud className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-cyan drop-shadow-[0_0_14px_rgba(0,242,255,.75)]" />
        </div>
        <h2 className="font-display text-2xl font-bold text-white">
          {file ? file.name : "Drop your video to begin neural encoding"}
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
          MP4, MOV, or WebM. The server will reject videos that are 30 seconds or longer before starting the GPU job.
        </p>
        {file && (
          <div className="mt-6 flex items-center gap-2 rounded border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
            <CheckCircle2 className="h-4 w-4" />
            {(file.size / (1024 * 1024)).toFixed(1)} MB ready for validation
          </div>
        )}
      </button>

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded border border-danger/40 bg-danger/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-display text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          Modal GPU jobs can run 15-20 minutes
        </div>
        <button
          type="button"
          disabled={!file || isSubmitting}
          onClick={submit}
          className="inline-flex items-center justify-center gap-2 rounded px-5 py-3 font-display text-xs font-bold uppercase tracking-[0.18em] transition filled-cyber-button disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {isSubmitting ? "Validating" : "Start Scan"}
        </button>
      </div>
    </div>
  );
}
