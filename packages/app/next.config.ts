import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only transpile the local workspace package — it ships TypeScript/JSX source.
  // The @strudel/* and @kabelsalat/* packages are pre-compiled ESM bundles;
  // adding them to transpilePackages causes Turbopack to try statically resolving
  // their internal new URL("assets/...", import.meta.url) worker references and
  // fail with "Module not found: Can't resolve <dynamic>".
  transpilePackages: ["@stave/editor"],

  // The Stave Code docs site is built by @stave/docs (Astro Starlight) into
  // packages/app/public/docs. Next's static serving picks it up at /docs.
  // In dev, the Astro dev server runs on :4321 — a rewrite forwards /docs
  // there so the MenuBar Docs button works without a separate build step.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    // The Astro dev server is configured with base '/docs/', so its URLs
    // already include that prefix — forward verbatim.
    return [
      { source: "/docs", destination: "http://localhost:4321/docs" },
      { source: "/docs/:path*", destination: "http://localhost:4321/docs/:path*" },
    ];
  },
};

export default nextConfig;
