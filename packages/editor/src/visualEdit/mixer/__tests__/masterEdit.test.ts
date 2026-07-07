/**
 * masterEdit — the master strip's pure write path (all(x => …)), issue #792.
 *
 * These lock the pure `doc → StripEdit` boundary for the master fader and the
 * global backdrop, the same way `writeStrip.test.ts` locks the channel controls:
 * detect → edit → apply → assert the exact resulting source. No Monaco. The live
 * round-trip (drag → code, code → backdrop render) is the Playwright layer.
 */
import { describe, it, expect } from 'vitest'

import { applyEdits } from '../../writeback'
import type { StripEdit } from '../writeStrip'
import {
  detectMasterAll,
  readMasterGain,
  readMasterViz,
  masterGainEdit,
  masterVizEdit,
} from '../masterEdit'

/** apply a master edit to the source it was computed from */
function applied(src: string, edit: StripEdit | null): string {
  expect(edit).not.toBeNull()
  return applyEdits(src, [edit as StripEdit])
}

describe('detectMasterAll', () => {
  it('finds a top-level all(x => …) arrow statement and its chain', () => {
    const alls = detectMasterAll('$: s("bd")\nall(x => x.gain(0.85))')
    expect(alls).toHaveLength(1)
    expect(alls[0].chain.map((c) => c.name)).toEqual(['gain'])
    expect(alls[0].chain[0].args[0].numeric).toBe(0.85)
  })

  it('reads a combined gain().viz() chain in source order', () => {
    const alls = detectMasterAll('all(x => x.gain(0.8).viz("Prism", { backdrop: true }))')
    expect(alls[0].chain.map((c) => c.name)).toEqual(['gain', 'viz'])
  })

  it('ignores non-arrow all(fast(…)) and block-body arrows', () => {
    expect(detectMasterAll('all(fast("<2 3>"))')).toEqual([])
    expect(detectMasterAll('all(x => { return x.gain(1) })')).toEqual([])
  })

  it('returns [] for a doc that does not parse', () => {
    expect(detectMasterAll('all(x => x.gain(')).toEqual([])
  })
})

describe('readMasterGain', () => {
  it('reads the scalar from an all() gain line', () => {
    expect(readMasterGain('all(x => x.gain(0.6))')).toEqual({ value: 0.6, foreign: false })
  })

  it('is unity when absent (the untouched master projects the default)', () => {
    expect(readMasterGain('$: s("bd")')).toEqual({ value: 1, foreign: false })
  })

  it('flags a signal gain as foreign (fader disables, shows unity)', () => {
    expect(readMasterGain('all(x => x.gain(sine))')).toEqual({ value: 1, foreign: true })
  })
})

describe('masterGainEdit', () => {
  it('patches the scalar in an existing all() gain line', () => {
    const src = 'all(x => x.gain(0.6))'
    expect(applied(src, masterGainEdit(src, 0.85))).toBe('all(x => x.gain(0.85))')
  })

  it('inserts a fresh all() gain line when absent (appended as a new line)', () => {
    const src = '$: s("bd*4")'
    expect(applied(src, masterGainEdit(src, 0.85))).toBe('$: s("bd*4")\nall(x => x.gain(0.85))')
  })

  it('materializes into an empty document with no leading newline', () => {
    expect(applied('', masterGainEdit('', 0.7))).toBe('all(x => x.gain(0.7))')
  })

  it('writes the literal .gain(1) at unity (decision 4 — matches channel gainEdit)', () => {
    const src = '$: s("bd")'
    expect(applied(src, masterGainEdit(src, 1))).toBe('$: s("bd")\nall(x => x.gain(1))')
  })

  it('binds to a hand-combined chain, patching only the gain literal', () => {
    const src = 'all(x => x.gain(0.8).viz("Prism", { backdrop: true }))'
    expect(applied(src, masterGainEdit(src, 0.5))).toBe(
      'all(x => x.gain(0.5).viz("Prism", { backdrop: true }))',
    )
  })

  it('disables (null) on a foreign signal gain', () => {
    expect(masterGainEdit('all(x => x.gain(sine))', 0.5)).toBeNull()
  })

  it('round-trips: edit then re-read yields the written value', () => {
    const src = '$: s("bd")'
    const next = applied(src, masterGainEdit(src, 0.42))
    expect(readMasterGain(next)).toEqual({ value: 0.42, foreign: false })
  })
})

describe('readMasterViz', () => {
  it('reads the backdrop viz name', () => {
    expect(readMasterViz('all(x => x.viz("Prism", { backdrop: true }))')).toEqual({ name: 'Prism' })
  })

  it('is null when no master backdrop is declared', () => {
    expect(readMasterViz('all(x => x.gain(0.8))')).toBeNull()
  })

  it('ignores a channel-scoped inline viz (no backdrop flag)', () => {
    expect(readMasterViz('$: s("bd").viz("pianoroll")')).toBeNull()
  })
})

describe('masterVizEdit', () => {
  it('inserts a fresh backdrop line when absent (split from any gain line)', () => {
    const src = 'all(x => x.gain(0.85))'
    expect(applied(src, masterVizEdit(src, 'Prism'))).toBe(
      'all(x => x.gain(0.85))\nall(x => x.viz("Prism", { backdrop: true }))',
    )
  })

  it('patches the name of an existing backdrop viz', () => {
    const src = 'all(x => x.viz("Prism", { backdrop: true }))'
    expect(applied(src, masterVizEdit(src, 'fscope'))).toBe(
      'all(x => x.viz("fscope", { backdrop: true }))',
    )
  })

  it('clears by removing the whole all() line when the viz is all it carries', () => {
    const src = '$: s("bd")\nall(x => x.viz("Prism", { backdrop: true }))'
    expect(applied(src, masterVizEdit(src, null))).toBe('$: s("bd")')
  })

  it('clears surgically from a combined chain (keeps the gain)', () => {
    const src = 'all(x => x.gain(0.8).viz("Prism", { backdrop: true }))'
    expect(applied(src, masterVizEdit(src, null))).toBe('all(x => x.gain(0.8))')
  })

  it('is a no-op (null) when clearing with no master backdrop present', () => {
    expect(masterVizEdit('all(x => x.gain(0.8))', null)).toBeNull()
  })

  it('round-trips: set then re-read yields the written name', () => {
    const src = '$: s("bd")'
    const next = applied(src, masterVizEdit(src, 'spectrum'))
    expect(readMasterViz(next)).toEqual({ name: 'spectrum' })
  })
})
