/**
 * soloOverlay — the pure eval-input transform for SOLO (#550-S5).
 *
 * Solo silences non-soloed tracks in the STRING sent to the engine, never the
 * file (D3). These lock the safety-critical behaviours: exact identity when
 * nothing/nothing-matching is soloed (so the file's playback is byte-for-byte
 * unchanged and a stale solo can't silence the whole mix), and the `_`-prefix /
 * block-comment silencing of the non-soloed tracks.
 */
import { describe, it, expect } from 'vitest'

import { applyMonitorOverlay } from '../soloOverlay'

describe('applyMonitorOverlay', () => {
  it('is exact identity when nothing is soloed', () => {
    const doc = '$: s("bd")\nd1: s("hh")'
    expect(applyMonitorOverlay(doc, new Set())).toBe(doc)
  })

  it('is exact identity when the soloed ids match no strip (stale solo guard)', () => {
    const doc = '$: s("bd")\nd1: s("hh")'
    // a dangling solo must NOT silence everything
    expect(applyMonitorOverlay(doc, new Set(['ghost']))).toBe(doc)
  })

  it('mutes non-soloed labelled tracks with the `_` prefix; soloed stays intact', () => {
    const doc = '$: s("bd")\nd1: s("hh")'
    // solo the named track → the anonymous `$:` (id #0) is silenced
    expect(applyMonitorOverlay(doc, new Set(['d1']))).toBe('_$: s("bd")\nd1: s("hh")')
    // solo the anonymous track (stable id #0) → d1 is silenced
    expect(applyMonitorOverlay(doc, new Set(['#0']))).toBe('$: s("bd")\n_d1: s("hh")')
  })

  it('keeps multiple soloed tracks audible and mutes the rest', () => {
    const doc = '$: s("bd")\nd1: s("hh")\nd2: s("cp")'
    expect(applyMonitorOverlay(doc, new Set(['d1', 'd2']))).toBe(
      '_$: s("bd")\nd1: s("hh")\nd2: s("cp")',
    )
  })

  it('leaves an already-muted non-soloed track as-is (no double `_`)', () => {
    const doc = '_$: s("bd")\nd1: s("hh")'
    // $: is already `_`-muted; soloing d1 must not turn it into `__$:`
    expect(applyMonitorOverlay(doc, new Set(['d1']))).toBe(doc)
  })

  it('block-comments a non-soloed bare-expression statement (no label to prefix)', () => {
    const doc = 's("bd")\nd1: s("hh")'
    const out = applyMonitorOverlay(doc, new Set(['d1']))
    expect(out).toContain('/* s("bd") */')
    expect(out).toContain('d1: s("hh")')
    expect(out).not.toBe(doc)
  })

  it('applies edits right-to-left so later offsets stay valid', () => {
    // three anonymous tracks, solo the middle → first and third both silenced,
    // and the splices must not corrupt each other
    const doc = '$: s("a")\n$: s("b")\n$: s("c")'
    expect(applyMonitorOverlay(doc, new Set(['#1']))).toBe('_$: s("a")\n$: s("b")\n_$: s("c")')
  })
})
