import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Tree-shake the icon barrel file so the client bundle only ships used icons
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        // The service worker must always be revalidated so updates reach users quickly
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
