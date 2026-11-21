import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "127.0.2.2"],
};

export default nextConfig;
