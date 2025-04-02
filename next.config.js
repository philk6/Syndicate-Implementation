/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase the watcher poll interval to reduce CPU usage
  webpack: (config, { isServer, dev }) => {
    if (dev && !isServer) {
      // Improve file watching configuration
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000, // Check for changes every 1000ms
        aggregateTimeout: 500, // Wait 500ms after changes before rebuilding
        ignored: ['**/node_modules', '**/.git', '**/.next'],
      };
    }
    return config;
  },
  // Optimize the output
  swcMinify: true,
  // Prevent excessive rebuilds on Mac
  fileSystemCache: true,
  // Increase serverComponentsExternalPackages limit
  experimental: {
    serverComponentsExternalPackages: [],
    // Enable more stable page generation
    turbotrace: {
      logLevel: 'error',
    }
  },
  // Configure output for better stability
  output: 'standalone',
  // Don't attempt to use server components when fast refreshing
  compiler: {
    // Silence irrelevant warnings
    // This is important because it reduces noise in the logs
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },
};

module.exports = nextConfig; 