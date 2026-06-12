import { readFile } from "node:fs/promises";
import path from "node:path";

// #322 — serve the @stave/docs (Astro Starlight) static site under /docs.
//
// The docs build publishes its output (directory format, base '/docs/') into
// packages/app/docs-dist — deliberately NOT public/, because Next 16's
// public-static handler claims the nested directory clean-URLs (each
// `<page>/index.html` exists) and 404s them before any route or rewrite can
// serve them (verified against `next build && next start`). Keeping the tree
// out of public/ lets this handler own all of /docs/*.
//
// In dev a next.config rewrite forwards /docs/* to the Astro dev server (:4321)
// before this handler runs, so the handler is the production path only.
//
// docs-dist is traced into this function's bundle via next.config
// `outputFileTracingIncludes` so readFile resolves on Vercel (where the files
// are otherwise not on the function filesystem).

const DOCS_ROOT = path.join(process.cwd(), "docs-dist");

// Astro emits a small, fixed set of extensions. Anything not listed (pagefind's
// .pf_fragment/.pf_index/.pf_meta/.pagefind binary chunks) falls back to
// octet-stream, which is correct — pagefind fetches those as array buffers.
export const DOCS_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/**
 * Map a /docs/* request (the catch-all slug segments) to a file under `root`.
 *
 * - A slug with a file extension is an asset, served verbatim.
 * - An extensionless slug is a page; Astro's directory build emits
 *   `<route>/index.html`, and the root (`/docs`, slug `[]`) is the index.
 * - Returns null if the resolved path escapes `root` (`..` traversal).
 *
 * Pure (no IO) so the traversal guard and page/asset disambiguation are unit
 * tested without a filesystem.
 */
export function resolveDocsFile(
  slug: string[],
  root: string,
): { filePath: string; contentType: string } | null {
  const rel = slug.join("/");
  const isAsset = path.extname(rel) !== "";
  const filePath = isAsset
    ? path.resolve(root, rel)
    : path.resolve(root, rel, "index.html");

  // Contain to `root`. The root page resolves to `<root>/index.html`, which
  // satisfies the prefix guard.
  if (!filePath.startsWith(root + path.sep)) return null;

  return {
    filePath,
    contentType: DOCS_MIME[path.extname(filePath)] ?? "application/octet-stream",
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await ctx.params;
  const resolved = resolveDocsFile(slug, DOCS_ROOT);
  if (!resolved) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(resolved.filePath);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": resolved.contentType,
        // Docs are rebuilt and republished on every deploy; revalidate rather
        // than cache hard so a new deploy is picked up immediately.
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
