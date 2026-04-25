import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        surface: "#131313",
        panel: "#121212",
        panelHigh: "#201f1f",
        cyan: "#00f2ff",
        cyanSoft: "#74f5ff",
        purple: "#9d05ff",
        magenta: "#ff00e5",
        outline: "#849495",
        muted: "#b9cacb",
        danger: "#ff6b75"
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        monoDisplay: ["Space Grotesk", "monospace"]
      },
      boxShadow: {
        cyan: "0 0 24px rgba(0, 242, 255, 0.22)",
        purple: "0 0 24px rgba(157, 5, 255, 0.24)",
        panel: "0 24px 80px rgba(0, 0, 0, 0.55)"
      }
    }
  },
  plugins: []
};

export default config;
