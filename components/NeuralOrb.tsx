type NeuralOrbProps = {
  compact?: boolean;
};

export function NeuralOrb({ compact = false }: NeuralOrbProps) {
  const size = compact ? "h-40 w-40" : "h-72 w-72";

  return (
    <div className={`relative ${size}`}>
      <div className="absolute inset-0 rounded-full border border-cyan/20" />
      <div className="absolute inset-[12%] rounded-full border border-purple/25" />
      <div className="absolute inset-[24%] rounded-full border border-cyan/30" />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan shadow-cyan" />
      <div className="absolute left-[33%] top-[42%] h-2 w-2 rounded-full bg-purple shadow-purple" />
      <div className="absolute left-[66%] top-[58%] h-2 w-2 rounded-full bg-cyan shadow-cyan" />
      <div className="absolute inset-[18%] rounded-full border border-cyan/20 blur-[1px]" style={{ animation: "pulse-ring 2.4s ease-out infinite" }} />
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <div className="sweep-line absolute left-0 right-0 top-1/2 h-px bg-cyan/60 shadow-cyan" />
      </div>
      <svg className="absolute inset-0 h-full w-full opacity-70" viewBox="0 0 200 200" aria-hidden="true">
        <path d="M68 92 C88 64, 119 65, 135 91" stroke="rgba(0,242,255,.45)" strokeWidth="1" fill="none" />
        <path d="M61 116 C91 139, 129 134, 148 104" stroke="rgba(157,5,255,.5)" strokeWidth="1" fill="none" />
        <path d="M80 70 L120 130 M52 102 L151 100" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
      </svg>
    </div>
  );
}
