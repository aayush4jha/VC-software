import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Baked into the client bundle at build time. Compared against the
    // running deployment's own SHA so a tab left open across a deploy can
    // say so instead of quietly showing yesterday's interface.
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },
};

export default nextConfig;
