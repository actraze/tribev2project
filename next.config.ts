import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd()
  },
  experimental: {
    proxyClientMaxBodySize: "160mb"
  }
};

export default nextConfig;
