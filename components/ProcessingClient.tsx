"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RadioTower } from "lucide-react";
import { NeuralOrb } from "@/components/NeuralOrb";
import { StatusPill } from "@/components/StatusPill";
import type { JobRecord, PipelineStatus } from "@/lib/types";

type ProcessingClientProps = {
  id: string;
};

const steps: Array<{ status: PipelineStatus; label: string; detail: string }> = [
  { status: "queued", label: "Upload accepted", detail: "Video is staged on local disk." },
  { status: "brain_encoding", label: "Brain encoding", detail: "Modal A10G is running TRIBE v2." },
  { status: "pulling_results", label: "Pulling neural tensor", detail: "Fetching Modal volume output." },
  { status: "extracting_features", label: "Extracting features", detail: "Building region activation timeline." },
  { status: "extracting_frames", label: "Extracting keyframes", detail: "Saving one frame per second." },
  { status: "diagnosing", label: "Neural diagnosis", detail: "Kimi K2.6 is reading frames and brain data." },
  { status: "briefing", label: "Creator brief", detail: "Compressing the diagnosis into action items." },
  { status: "completed", label: "Complete", detail: "Dashboard is ready." }
];

function stepState(job: JobRecord | null, index: number) {
  const current = job?.stepIndex ?? 0;
  if (job?.status === "failed" || job?.status === "failed_restart_required") {
    if (index === current) return "failed";
    return index < current ? "done" : "waiting";
  }
  if (index < current) return "done";
  if (index === current) return "active";
  return "waiting";
}

export function ProcessingClient({ id }: ProcessingClientProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobRecord | null>(null);
  const [streamError, setStreamError] = useState("");

  useEffect(() => {
    const events = new EventSource(`/api/progress/${id}`);

    events.onmessage = (event) => {
      const nextJob = JSON.parse(event.data) as JobRecord & { error?: string };
      if (nextJob.error && !nextJob.id) {
        setStreamError(nextJob.error);
        events.close();
        return;
      }
      setJob(nextJob);
      if (nextJob.status === "completed") {
        events.close();
        window.setTimeout(() => router.push(`/results/${id}`), 900);
      }
    };

    events.onerror = () => {
      setStreamError("Progress stream disconnected. You can refresh this page to reconnect.");
      events.close();
    };

    return () => events.close();
  }, [id, router]);

  const isFailed = job?.status === "failed" || job?.status === "failed_restart_required";
  const progress = useMemo(() => {
    const index = job?.stepIndex ?? 0;
    return Math.min(100, Math.round((index / (steps.length - 1)) * 100));
  }, [job?.stepIndex]);

  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 py-10 md:px-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="space-y-6">
        <div className="panel relative overflow-hidden rounded-lg p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <StatusPill tone={isFailed ? "danger" : "cyan"}>
                {isFailed ? "Pipeline Halted" : "Processing Pipeline"}
              </StatusPill>
              <h1 className="mt-4 font-display text-3xl font-bold text-white">
                {job?.stepLabel ?? "Connecting to job"}
              </h1>
            </div>
            <RadioTower className="h-8 w-8 text-cyan" />
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Modal can take 15-20 minutes for a single video. This page can stay open while the background job writes progress to disk.
          </p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${isFailed ? "bg-danger" : "bg-cyan shadow-cyan"}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 font-display text-xs uppercase tracking-[0.18em] text-zinc-500">
            Job {id}
          </div>
        </div>

        <div className="panel relative overflow-hidden rounded-lg p-6">
          <div className="relative pl-6">
            <div className="absolute bottom-0 left-[11px] top-0 w-px bg-gradient-to-b from-cyan via-white/15 to-white/5" />
            <div className="space-y-5">
              {steps.map((step, index) => {
                const state = stepState(job, index);
                return (
                  <div key={step.status} className="relative flex gap-4">
                    <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      state === "done"
                        ? "border-cyan bg-cyan text-black"
                        : state === "active"
                          ? "border-cyan bg-black shadow-cyan"
                          : state === "failed"
                            ? "border-danger bg-danger/20 text-red-100"
                            : "border-white/15 bg-black"
                    }`}>
                      {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "active" ? <span className="h-2 w-2 rounded-full bg-cyan" /> : state === "failed" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                    </div>
                    <div className={`rounded border p-3 ${
                      state === "active"
                        ? "border-cyan/45 bg-cyan/10"
                        : state === "failed"
                          ? "border-danger/40 bg-danger/10"
                          : "border-white/10 bg-white/[0.03]"
                    }`}>
                      <div className="font-display text-sm font-bold uppercase tracking-[0.14em] text-white">{step.label}</div>
                      <div className="mt-1 text-sm text-zinc-400">{step.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="panel relative flex min-h-[560px] flex-col items-center justify-center overflow-hidden rounded-lg p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,255,.16),transparent_45%)]" />
        <NeuralOrb />
        <div className="relative z-10 mt-8 text-center">
          {isFailed ? (
            <>
              <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-danger" />
              <h2 className="font-display text-2xl font-bold text-white">Pipeline failed</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-red-100">{job?.error ?? "Check the job log for details."}</p>
              <Link href="/scan" className="mt-6 inline-flex rounded px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.18em] cyber-button">
                Upload Another
              </Link>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-cyan" />
              <h2 className="font-display text-2xl font-bold text-white">Neural scan running</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Keep this tab open, or come back to this URL while the job is still running.
              </p>
            </>
          )}
          {streamError && <p className="mt-5 text-xs text-zinc-500">{streamError}</p>}
        </div>
      </div>
    </section>
  );
}
