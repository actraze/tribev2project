import Link from "next/link";
import Image from "next/image";
import { Activity, BrainCircuit, Timer, Upload } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { NeuralOrb } from "@/components/NeuralOrb";
import { StatusPill } from "@/components/StatusPill";

const demoId = process.env.DEMO_ANALYSIS_ID ?? "DVj0HP6CQOP";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <AppHeader active="landing" />
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 items-center gap-10 px-5 py-12 md:grid-cols-[1.02fr_.98fr] md:px-8">
        <div className="space-y-8">
          <StatusPill>Single Reel Neural Diagnostic</StatusPill>
          <div className="space-y-5">
            <h1 className="max-w-4xl font-display text-5xl font-black leading-[0.95] tracking-tight text-white md:text-7xl">
              Upload a reel. See how brains react.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted">
              TRIBE v2 converts a short video into per-second neural activation,
              then a multimodal diagnosis explains where attention spikes, where
              it drops, and what to change.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/scan" className="rounded px-5 py-3 text-center font-display text-xs font-bold uppercase tracking-[0.18em] transition filled-cyber-button">
              Try Now
            </Link>
            <Link href={`/results/${demoId}`} className="rounded px-5 py-3 text-center font-display text-xs font-bold uppercase tracking-[0.18em] transition cyber-button">
              View Demo
            </Link>
          </div>
          <div className="grid max-w-3xl grid-cols-1 gap-3 pt-5 sm:grid-cols-3">
            {[
              { icon: Upload, label: "Upload", text: "MP4, MOV, or WebM under 30 seconds." },
              { icon: BrainCircuit, label: "Encode", text: "Modal runs TRIBE v2 on GPU." },
              { icon: Activity, label: "Diagnose", text: "Dashboard maps video time to brain response." }
            ].map((item) => (
              <div key={item.label} className="panel relative overflow-hidden rounded-lg p-4">
                <item.icon className="mb-4 h-5 w-5 text-cyan" />
                <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white">{item.label}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="panel relative overflow-hidden rounded-lg p-4 md:p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent opacity-70" />
            <div className="relative aspect-[4/5] overflow-hidden rounded border border-white/10 bg-black">
              <Image
                src={`/api/frames/${demoId}/frame_001.jpg`}
                alt="Demo reel frame"
                fill
                sizes="(max-width: 768px) 100vw, 48vw"
                className="object-cover opacity-60"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/75" />
              <div className="absolute left-5 top-5">
                <StatusPill>Demo Ready</StatusPill>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <NeuralOrb />
              </div>
              <div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 gap-3">
                {[
                  ["Max Length", "30s"],
                  ["GPU Wait", "15-20m"],
                  ["Demo Load", "Instant"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
                    <div className="font-display text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                    <div className="mt-1 font-display text-lg font-bold text-cyan">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute -right-4 -top-4 hidden rounded border border-cyan/30 bg-black/70 p-3 font-display text-xs uppercase tracking-[0.18em] text-cyan shadow-cyan md:block">
            <Timer className="mr-2 inline h-4 w-4" />
            Long jobs safe
          </div>
        </div>
      </section>
    </main>
  );
}
