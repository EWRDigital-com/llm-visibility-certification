/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The pure scorer + scrape libs use cheerio (a CJS package) on the server only.
  serverExternalPackages: ["cheerio"],
  // Lint is run separately (vitest/tsc are the gate here), not during `next build`.
  eslint: { ignoreDuringBuilds: true },
  // The lib/ modules use NodeNext-style ".js" import specifiers that resolve to ".ts"
  // sources — tell webpack to resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
