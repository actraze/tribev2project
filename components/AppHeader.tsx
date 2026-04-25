import Link from "next/link";

type AppHeaderProps = {
  active?: "landing" | "scan" | "processing" | "results";
};

export function AppHeader({ active }: AppHeaderProps) {
  const links = [
    { href: "/", label: "Home", key: "landing" },
    { href: "/scan", label: "Scan", key: "scan" },
    { href: "/results/DVj0HP6CQOP", label: "Demo", key: "results" }
  ];

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-black/70 px-5 backdrop-blur-xl md:px-8">
      <Link href="/" className="font-display text-2xl font-black tracking-tight text-cyan text-glow">
        TRIBE v2
      </Link>
      <nav className="hidden items-center gap-6 font-display text-xs uppercase tracking-[0.18em] text-zinc-500 md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              active === link.key
                ? "text-cyan"
                : "transition-colors hover:text-cyan"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Link
        href="/scan"
        className="rounded px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.18em] transition filled-cyber-button"
      >
        Try Now
      </Link>
    </header>
  );
}
