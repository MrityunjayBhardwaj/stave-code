import { loader } from '@monaco-editor/react'

/**
 * Where the app serves the Monaco `vs` assets from. The @stave/app build copies
 * `monaco-editor/min/vs` into `public/monaco/vs` (see packages/app/scripts/
 * copy-monaco.mjs), so this resolves to a same-origin `/monaco/vs/…` URL.
 */
const MONACO_VS_PATH = '/monaco/vs'

// Self-host Monaco instead of @monaco-editor's jsdelivr CDN default (#690).
// `@monaco-editor/loader` otherwise fetches the editor core + its web workers
// from a third-party CDN at runtime, so the editor needs the network even after
// the app has "loaded" and breaks offline / on a flaky connection. Point the
// loader at our own origin instead. This runs as a MODULE side-effect — before
// any `loader.init()` (warmMonaco below) or `<Editor>` mount calls it — because
// `loader.config` must be set before the first init or it's ignored. It is also
// what makes the self-host effective under the app's COOP/COEP cross-origin
// isolation: same-origin assets avoid the cross-origin subresource concern.
loader.config({ paths: { vs: MONACO_VS_PATH } })

let warmed: Promise<unknown> | null = null

/**
 * Kick off loading the Monaco editor core ahead of the first <Editor> mount.
 *
 * `@monaco-editor/react` lazily loads Monaco through its loader only when the
 * first <Editor> renders. That render happens inside the app shell, AFTER the
 * boot preloader clears, so the editor pops in a beat late. Calling this during
 * the preloader window warms Monaco in parallel with the rest of boot, so the
 * core is usually already loaded by the time the editor mounts (#689). Combined
 * with the self-hosted `loader.config` above, the fetch is same-origin (#690).
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
