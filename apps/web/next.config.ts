import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // node:sqlite is used for local-dev job metadata only.
  },
  serverExternalPackages: [],
};

export default nextConfig;
