import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only transpile the local workspace package — it ships TypeScript/JSX source.
  // The @strudel/* and @kabelsalat/* packages are pre-compiled ESM bundles;
  // adding them to transpilePackages causes Turbopack to try statically resolving
  // their internal new URL("assets/...", import.meta.url) worker references and
  // fail with "Module not found: Can't resolve <dynamic>".
  transpilePackages: ["@stave/editor"],

  // #322 — the /docs/[[...slug]] route handler reads the published docs site
  // (pages + assets) from ./docs-dist at runtime. On Vercel these files are not
  // on the serverless function's filesystem by default, so trace the whole tree
  // into the function bundle.
  outputFileTracingIncludes: {
    "/docs/[[...slug]]": ["./docs-dist/**/*"],
  },

  // ── Phase B pre-flight Q2 (#237) — cross-origin isolation for SharedArrayBuffer.
  // SAB is the planned per-frame viz-signal transport between the main thread and
  // the OffscreenCanvas worker; it requires `crossOriginIsolated`, which needs
  // COOP + COEP. We use COEP `credentialless` (NOT `require-corp`) so cross-origin
  // subresources (e.g. strudel.cc sample packs) still load without needing CORP
  // headers from the remote — `require-corp` would block them and silence drums.
  // OBSERVE (b-preflight-coep.spec.ts): crossOriginIsolated true + SAB allocatable
  // AND AudioWorklet/superdough still boots + triggers fire.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },

  // ── #322 — serve the @stave/docs (Astro Starlight) site under /docs.
  // DEV: the Astro dev server runs on :4321 with the same '/docs/' base — forward
  // there so the MenuBar Docs button works against live docs without a build step.
  // PROD: the src/app/docs/[[...slug]] route handler serves the whole site (pages
  // and assets) from ./docs-dist, so no prod rewrite is needed. The output is kept
  // out of public/ because Next's public-static handler shadows the nested
  // directory clean-URLs (verified) — see the route handler for the full why.
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        { source: "/docs", destination: "http://localhost:4321/docs" },
        { source: "/docs/:path*", destination: "http://localhost:4321/docs/:path*" },
      ];
    }
    return [];
  },
};

export default nextConfig;
