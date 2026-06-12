import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveDocsFile, DOCS_MIME } from "../route";

// A fixed absolute root keeps assertions platform-stable.
const ROOT = path.resolve("/srv/docs-dist");
const j = (...p: string[]) => path.join(ROOT, ...p);

describe("resolveDocsFile (#322 /docs serving)", () => {
  it("maps the root (empty slug) to the index page", () => {
    const r = resolveDocsFile([], ROOT);
    expect(r).toEqual({
      filePath: j("index.html"),
      contentType: DOCS_MIME[".html"],
      cacheControl: "public, max-age=0, must-revalidate",
    });
  });

  it("maps an extensionless single-segment slug to <slug>/index.html", () => {
    const r = resolveDocsFile(["getting-started"], ROOT);
    expect(r?.filePath).toBe(j("getting-started", "index.html"));
    expect(r?.contentType).toBe(DOCS_MIME[".html"]);
  });

  it("maps a nested page slug to the directory index.html", () => {
    const r = resolveDocsFile(["architecture", "glsl"], ROOT);
    expect(r?.filePath).toBe(j("architecture", "glsl", "index.html"));
    expect(r?.contentType).toBe(DOCS_MIME[".html"]);
  });

  it("serves an asset (path with extension) verbatim with its mime", () => {
    expect(resolveDocsFile(["_astro", "index.abc.css"], ROOT)).toEqual({
      filePath: j("_astro", "index.abc.css"),
      contentType: DOCS_MIME[".css"],
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(resolveDocsFile(["_astro", "page.abc.js"], ROOT)?.contentType).toBe(
      DOCS_MIME[".js"],
    );
    expect(resolveDocsFile(["docs-search.json"], ROOT)?.contentType).toBe(
      DOCS_MIME[".json"],
    );
    expect(resolveDocsFile(["sitemap-index.xml"], ROOT)?.contentType).toBe(
      DOCS_MIME[".xml"],
    );
  });

  it("falls back to octet-stream for pagefind binary chunks", () => {
    // .pagefind (wasm) and .pf_* fragments are not in the mime map.
    expect(resolveDocsFile(["pagefind", "wasm.unknown.pagefind"], ROOT)?.contentType).toBe(
      "application/octet-stream",
    );
    expect(resolveDocsFile(["pagefind", "fragment", "x.pf_fragment"], ROOT)?.contentType).toBe(
      "application/octet-stream",
    );
  });

  it("caches content-hashed _astro assets immutably, revalidates everything else", () => {
    expect(resolveDocsFile(["_astro", "page.abc.js"], ROOT)?.cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(resolveDocsFile(["getting-started"], ROOT)?.cacheControl).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(resolveDocsFile(["pagefind", "pagefind-entry.json"], ROOT)?.cacheControl).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  it("rejects `..` traversal out of the docs root", () => {
    expect(resolveDocsFile(["..", "..", "etc", "passwd"], ROOT)).toBeNull();
    expect(resolveDocsFile(["..", "next.config.ts"], ROOT)).toBeNull();
    // a sibling dir that shares the root's prefix must NOT pass the guard
    expect(resolveDocsFile(["..", "docs-dist-secrets", "x"], ROOT)).toBeNull();
  });
});
