import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // Turning off persistent cache avoids issues where cached pack files are pruned
    // while Next.js is still trying to access them, resulting in 500 responses.
    config.cache = false;
    return config;
  },
};

export default nextConfig;
