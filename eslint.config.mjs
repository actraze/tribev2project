import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "data/**",
      "outputs/**",
      "reels/**",
      "stitch_exports/**",
      "tribev2/**"
    ]
  },
  ...nextVitals,
  ...nextTypescript
];

export default config;
