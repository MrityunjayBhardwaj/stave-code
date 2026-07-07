import { describe, it, expect } from 'vitest'

import { purgeLegacyMasterGain } from '../purgeLegacyMasterGain'

/** Minimal in-memory Storage stand-in (jsdom-free, exercises the key-scan). */
function makeStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(seed))
  return {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  } as Storage
}

describe('purgeLegacyMasterGain (#794)', () => {
  it('removes every stave:mixer.master:* key and leaves the rest untouched', () => {
    const s = makeStorage({
      'stave:mixer.master:fileA': '0.5',
      'stave:mixer.master:fileB': '0.8',
      'stave:tabs': '[…]',
      'stave.viz.worker': '1',
    })
    const purged = purgeLegacyMasterGain(s)
    expect(purged).toBe(2)
    expect(s.getItem('stave:mixer.master:fileA')).toBeNull()
    expect(s.getItem('stave:mixer.master:fileB')).toBeNull()
    // unrelated keys survive
    expect(s.getItem('stave:tabs')).toBe('[…]')
    expect(s.getItem('stave.viz.worker')).toBe('1')
  })

  it('is idempotent — a second run finds nothing to purge', () => {
    const s = makeStorage({ 'stave:mixer.master:x': '0.3' })
    expect(purgeLegacyMasterGain(s)).toBe(1)
    expect(purgeLegacyMasterGain(s)).toBe(0)
  })

  it('is a no-op with no storage (SSR) or no matching keys', () => {
    expect(purgeLegacyMasterGain(null)).toBe(0)
    expect(purgeLegacyMasterGain(makeStorage({ 'stave:tabs': '[]' }))).toBe(0)
  })
})
