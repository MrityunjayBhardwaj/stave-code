import { loader } from '@monaco-editor/react'

let warmed: Promise<unknown> | null = null

/**
 * Kick off loading the Monaco editor core ahead of the first <Editor> mount.
 *
 * `@monaco-editor/react` lazily fetches Monaco through its loader (the jsdelivr
 * CDN by default — the repo sets no `loader.config`, and every `monaco-editor`
 * import is `import type`) only when the first <Editor> renders. That render
 * happens inside the app shell, AFTER the boot preloader clears, so the editor
 * pops in a beat late (CDN round-trip + parse). Calling this during the
 * preloader window warms Monaco in parallel with the rest of boot, so the core
 * is usually already loaded by the time the editor mounts (#689).
 *
 * Idempotent + best-effort: the loader is a singleton (repeat `init()` returns
 * the same instance), the result is cached here, and a failed prefetch is
 * swallowed so the editor's own on-mount load can retry. Never throws; the
 * caller should fire-and-forget it (`void warmMonaco()`), never `await` it in a
 * path that gates the UI.
 */
export function warmMonaco(): Promise<unknown> {
  if (!warmed) {
    warmed = loader.init().catch(() => {
      // Best-effort prefetch — let the editor's on-mount load retry.
      warmed = null
      return null
    })
  }
  return warmed
}
