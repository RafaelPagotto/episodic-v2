import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "image.tmdb.org",
        protocol: "https",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
