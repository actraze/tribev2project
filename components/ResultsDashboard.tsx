"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Clock,
  FileText,
  Loader2,
  MessageSquareText,
  Play,
  Zap
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  ReferenceLine
} from "recharts";
import { StatusPill } from "@/components/StatusPill";
import {
  brainRegionOrder,
  formatBrainRegion,
  getBrainRegionColor
} from "@/lib/brainRegions";
import type { FeatureWindow, ResultsPayload, TranscriptWord } from "@/lib/types";

type ResultsDashboardProps = {
  id: string;
};

const BrainViewer3D = dynamic(
  () => import("@/components/BrainViewer3D").then((mod) => mod.BrainViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="panel relative flex min-h-[420px] items-center justify-center rounded-lg p-4">
        <Loader2 className="h-7 w-7 animate-spin text-cyan" />
      </div>
    )
  }
);

function activeWord(words: TranscriptWord[], time: number) {
  return words.find((word) => time >= word.start && time <= word.end);
}

function activeFrame(frames: string[], time: number) {
  if (!frames.length) return "";
  const index = Math.min(frames.length - 1, Math.max(0, Math.floor(time)));
  return frames[index] ?? frames[0];
}

export function ResultsDashboard({ id }: ResultsDashboardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [focusedRegion, setFocusedRegion] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/results/${id}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load results.");
        return payload as ResultsPayload;
      })
      .then((payload) => {
        if (isMounted) {
          setData(payload);
          setError("");
        }
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : "Could not load results.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.features.windows.map((window) => ({
      time: window.start_time,
      mean: Number(window.mean_activation.toFixed(4)),
      ...Object.fromEntries(
        Object.entries(window.region_activations).map(([key, value]) => [key, Number(value.toFixed(4))])
      )
    }));
  }, [data]);

  const activeWindow = useMemo<FeatureWindow | undefined>(() => {
    return data?.features.windows.find((window) => currentTime >= window.start_time && currentTime < window.end_time)
      ?? data?.features.windows.at(-1);
  }, [currentTime, data]);

  const regions = useMemo(() => {
    if (!data?.features.windows.length) return [];
    const available = Object.keys(data.features.windows[0].region_activations);
    return brainRegionOrder.filter((region) => available.includes(region));
  }, [data]);

  const chartRegions = useMemo(() => {
    if (focusedRegion && regions.includes(focusedRegion as typeof regions[number])) return [focusedRegion];
    return regions.slice(0, 4);
  }, [focusedRegion, regions]);

  const currentWord = useMemo(() => data ? activeWord(data.transcript, currentTime) : undefined, [currentTime, data]);
  const currentFrame = useMemo(() => data ? activeFrame(data.frames, currentTime) : "", [currentTime, data]);

  function seek(nextTime: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || nextTime, nextTime));
    setCurrentTime(video.currentTime);
  }

  if (isLoading) {
    return (
      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5">
        <div className="panel relative rounded-lg p-8 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-cyan" />
          <p className="font-display text-sm uppercase tracking-[0.18em] text-cyan">Loading neural dashboard</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5">
        <div className="panel relative max-w-xl rounded-lg p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-danger" />
          <h1 className="font-display text-2xl font-bold text-white">Results unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{error || "This analysis has not completed yet."}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/scan" className="rounded px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.18em] cyber-button">Upload</Link>
            <Link href="/results/DVj0HP6CQOP" className="rounded px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.18em] filled-cyber-button">Demo</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-[1800px] grid-cols-1 gap-5 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,.55fr)]">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,.92fr)_minmax(320px,.08fr)]">
          <div className="panel relative overflow-hidden rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <StatusPill>{data.demo ? "Preloaded Demo" : "Analysis Complete"}</StatusPill>
              <span className="font-display text-xs uppercase tracking-[0.18em] text-zinc-500">{id}</span>
            </div>
            <div className="relative aspect-video overflow-hidden rounded border border-white/10 bg-black">
              <video
                ref={videoRef}
                src={data.videoUrl}
                controls
                className="h-full w-full bg-black object-contain"
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <div className="pointer-events-none absolute left-4 top-4 rounded border border-cyan/40 bg-black/65 px-3 py-2 font-display text-xs uppercase tracking-[0.18em] text-cyan">
                REC / {currentTime.toFixed(2)}s
              </div>
            </div>
          </div>

          <div className="panel relative overflow-hidden rounded-lg p-4">
            <div className="flex items-center justify-between">
              <StatusPill tone="purple">Now</StatusPill>
              {isPlaying ? <Activity className="h-5 w-5 text-cyan" /> : <Play className="h-5 w-5 text-zinc-500" />}
            </div>
            <div className="mt-5 space-y-5">
              <Metric icon={Zap} label="Dominant" value={formatBrainRegion(activeWindow?.dominant_region ?? "n/a")} />
              <Metric icon={Activity} label="Mean Activation" value={(activeWindow?.mean_activation ?? 0).toFixed(3)} />
              <Metric icon={Clock} label="Window" value={`${activeWindow?.start_time ?? 0}-${activeWindow?.end_time ?? 0}s`} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[.95fr_1.05fr]">
          <BrainViewer3D
            activeWindow={activeWindow}
            windows={data.features.windows}
            isPlaying={isPlaying}
            focusedRegion={focusedRegion}
            onRegionFocus={setFocusedRegion}
          />

          <div className="panel relative overflow-hidden rounded-lg p-4">
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Brain activation timeline</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Click a brain region, frame, or scrub the video to sync the dashboard.
                </p>
              </div>
              <StatusPill>{data.metadata.durationSec.toFixed(0)} seconds</StatusPill>
            </div>
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 14, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="meanFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#00f2ff" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#00f2ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "#849495", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#849495", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(value) => Number(value).toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#080808", border: "1px solid rgba(0,242,255,.3)", borderRadius: 4, color: "#fff" }}
                    labelStyle={{ color: "#00f2ff" }}
                  />
                  <ReferenceLine x={Math.floor(currentTime / 2) * 2} stroke="#00f2ff" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="mean" stroke="#00f2ff" fill="url(#meanFill)" strokeWidth={2} />
                  {chartRegions.map((region) => (
                    <Area
                      key={region}
                      type="monotone"
                      dataKey={region}
                      stroke={getBrainRegionColor(region)}
                      fill="transparent"
                      strokeWidth={focusedRegion === region ? 2.3 : 1.35}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {regions.map((region) => {
                const isFocused = focusedRegion === region;
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setFocusedRegion(isFocused ? null : region)}
                    className={`rounded border px-2.5 py-1 font-display text-[10px] uppercase tracking-[0.14em] transition ${
                      isFocused ? "border-cyan bg-cyan text-black" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-cyan/50"
                    }`}
                  >
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: getBrainRegionColor(region) }} />
                    {formatBrainRegion(region)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div className="panel relative overflow-hidden rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">Keyframes</h2>
              <StatusPill tone="muted">{data.metadata.frameCount} frames</StatusPill>
            </div>
            <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-2">
              {data.frames.map((frame, index) => (
                <button
                  key={frame}
                  type="button"
                  onClick={() => seek(index)}
                  className={`relative h-28 w-20 shrink-0 overflow-hidden rounded border bg-black transition ${
                    frame === currentFrame ? "border-cyan shadow-cyan" : "border-white/10 opacity-70 hover:opacity-100"
                  }`}
                >
                  <Image src={frame} alt={`Frame ${index + 1}`} fill sizes="80px" className="object-cover" unoptimized />
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-display text-[10px] text-cyan">{index}s</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel relative overflow-hidden rounded-lg p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan" />
              <h2 className="font-display text-xl font-bold text-white">Transcript</h2>
            </div>
            <div className="max-h-40 overflow-y-auto text-sm leading-7 text-zinc-400">
              {data.transcript.map((word, index) => (
                <button
                  type="button"
                  key={`${word.word}-${word.start}-${index}`}
                  onClick={() => seek(word.start)}
                  className={`mr-1 rounded px-1 transition ${
                    currentWord === word ? "bg-cyan text-black" : "hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {word.word}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="panel relative overflow-hidden rounded-lg p-5">
          <div className="mb-4 flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-cyan" />
            <h2 className="font-display text-xl font-bold text-white">Creator brief</h2>
          </div>
          <Markdownish text={data.brief || "Brief not generated yet."} />
        </div>

        <div className="panel relative overflow-hidden rounded-lg p-5">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-purple-300" />
            <h2 className="font-display text-xl font-bold text-white">Neural diagnosis</h2>
          </div>
          <div className="max-h-[540px] overflow-y-auto pr-2">
            <Markdownish text={data.diagnosis || "Diagnosis not generated yet."} />
          </div>
        </div>
      </aside>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-cyan" />
        {label}
      </div>
      <div className="mt-2 break-words font-display text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function Markdownish({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-300">
      {text.split(/\n{2,}/).map((paragraph, index) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;
        const isHeading = /^#{1,3}\s/.test(trimmed) || /^[A-Z0-9 .:-]{6,}$/.test(trimmed.split("\n")[0]);
        return (
          <p key={`${trimmed.slice(0, 24)}-${index}`} className={isHeading ? "font-display text-base font-bold text-white" : ""}>
            {trimmed.replace(/^#{1,3}\s/, "")}
          </p>
        );
      })}
    </div>
  );
}
