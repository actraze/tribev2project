type StatusPillProps = {
  children: React.ReactNode;
  tone?: "cyan" | "purple" | "danger" | "muted";
};

export function StatusPill({ children, tone = "cyan" }: StatusPillProps) {
  const tones = {
    cyan: "border-cyan/40 bg-cyan/10 text-cyan",
    purple: "border-purple/40 bg-purple/10 text-purple-200",
    danger: "border-danger/50 bg-danger/10 text-red-200",
    muted: "border-white/10 bg-white/5 text-zinc-400"
  };

  return (
    <span className={`inline-flex items-center rounded border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.18em] ${tones[tone]}`}>
      {children}
    </span>
  );
}
