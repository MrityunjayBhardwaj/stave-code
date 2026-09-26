import { describe, expect, it, vi } from 'vitest'

const { setKey } = vi.hoisted(() => ({ setKey: vi.fn() }))
vi.mock('@strudel/webaudio', () => ({ samples: vi.fn(), soundMap: { get: () => ({}), setKey } }))

import { unregisterAsset } from '../assetStore'

/**
 * #1786 — a removed sound is unregistered under the key superdough stored it
 * at. `registerSound` lowercases and turns whitespace into `_`
 * (`superdough.mjs:62`); a raw name with a capital or a space would miss the
 * key and the sound would keep playing. Names made from filenames are already
 * in that form, so no browser arm reaches this case; this one does.
 */
describe('unregisterAsset', () => {
  it('deletes the key registerSound used, not the raw name', () => {
    setKey.mockClear()
    unregisterAsset('Loud  Kick')
    expect(setKey.mock.calls).toEqual([['loud_kick', undefined]])
  })
})
