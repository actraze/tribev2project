import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRIBE v2 Neural Video Insights",
  description: "Upload a short video and diagnose engagement with TRIBE v2 neural activation."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <div className="pointer-events-none fixed inset-0 z-0 opacity-20 scanline" />
        <div className="pointer-events-none fixed inset-0 z-0 neural-grid opacity-[0.18]" />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
