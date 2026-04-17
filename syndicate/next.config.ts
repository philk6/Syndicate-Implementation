import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../'),
  webpack: (config) => {
    // Turning off persistent cache avoids issues where cached pack files are pruned
    // while Next.js is still trying to access them, resulting in 500 responses.
    config.cache = false;
    return config;
  },
};

export default nextConfig;
