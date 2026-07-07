/**
 * purgeLegacyMasterGain — one-time cleanup of the retired master-gain store.
 *
 * Before #794, the master fader wrote a synthetic per-file OUTPUT gain persisted
 * under `stave:mixer.master:<fileId>` (the old `masterStore`). #792/#793 moved
 * the master trim into the document as `all(x => x.gain())`, so that per-file
 * value is now dead — but an OLD project that once set a non-unity master still
 * has the key in localStorage. It's never read anymore, yet leaving it is a
 * latent second gain source if the seam ever came back. Purge it on boot.
 *
 * Pure over the key list (SSR-safe, tolerant of quota/private-mode throws), so
 * it unit-tests without a browser.
 */

const KEY_PREFIX = 'stave:mixer.master:'

/** SSR-safe Storage, or null (mirrors the retired masterStore / expandStore). */
function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Remove every persisted `stave:mixer.master:*` value. Idempotent and safe to
 * call on every boot — after the first run there is nothing left to remove.
 * Returns the number of keys purged (for observation/tests).
 */
export function purgeLegacyMasterGain(storage: Storage | null = safeLocalStorage()): number {
  if (!storage) return 0
  try {
    // Snapshot the keys first — removing while iterating `key(i)` reindexes.
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) stale.push(k)
    }
    for (const k of stale) {
      try {
        storage.removeItem(k)
      } catch {
        /* quota / private mode — skip this key */
      }
    }
    return stale.length
  } catch {
    return 0
  }
}
