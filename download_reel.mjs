#!/usr/bin/env node

// Downloads an Instagram Reel using yt-dlp
// Usage: node download_reel.mjs <REEL_URL>

import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node download_reel.mjs <INSTAGRAM_REEL_URL>");
  process.exit(1);
}

// Extract reel code from URL
const match = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
if (!match) {
  console.error("Could not extract reel code from URL:", url);
  process.exit(1);
}
const code = match[1];

const reelsDir = resolve("reels");
if (!existsSync(reelsDir)) {
  mkdirSync(reelsDir, { recursive: true });
}

const outputPath = resolve(reelsDir, `${code}.mp4`);

console.log(`Downloading reel ${code}...`);

try {
  execSync(
    `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputPath}" "${url}"`,
    { stdio: "inherit" }
  );
  console.log(`Saved to ${outputPath}`);
} catch (e) {
  console.error("yt-dlp failed. Trying with cookies from browser...");
  try {
    execSync(
      `yt-dlp --cookies-from-browser safari -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputPath}" "${url}"`,
      { stdio: "inherit" }
    );
    console.log(`Saved to ${outputPath}`);
  } catch (e2) {
    console.error(
      "Download failed. You may need to log into Instagram in Safari first, or manually place the video at:",
      outputPath
    );
    process.exit(1);
  }
}
