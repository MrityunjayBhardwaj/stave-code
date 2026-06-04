import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only transpile the local workspace package — it ships TypeScript/JSX source.
  // The @strudel/* and @kabelsalat/* packages are pre-compiled ESM bundles;
  // adding them to transpilePackages causes Turbopack to try statically resolving
  // their internal new URL("assets/...", import.meta.url) worker references and
  // fail with "Module not found: Can't resolve <dynamic>".
  transpilePackages: ["@stave/editor"],

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
};

export default nextConfig;
