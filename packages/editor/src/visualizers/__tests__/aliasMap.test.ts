/**
 * aliasMap — engine-keyed built-in aliases + the per-engine resolver
 * (Phase 21 aliases, forward-compat for Sonic Web).
 *
 * Pure data + a pure resolver — plain-object assertions, no renderer/registry.
 */
import { describe, it, expect } from 'vitest'
import {
  ALIAS_MAP,
  BUILTIN_ALIASES,
  DEFAULT_VIZ_ENGINE,
  resolveAliasesForEngine,
  type StoredSignalAliases,
} from '../signals/aliasMap'

describe('BUILTIN_ALIASES — engine-keyed shape', () => {
  it('strudel slots match the historical flat built-ins', () => {
    expect(BUILTIN_ALIASES.uKick.strudel).toBe('bd')
    expect(BUILTIN_ALIASES.uSnare.strudel).toBe('sd')
    expect(BUILTIN_ALIASES.uTom.strudel).toEqual(['lt', 'mt', 'ht'])
  })

  it('seeds sonicpi slots from ground-truth sample symbols where canonical', () => {
    expect(BUILTIN_ALIASES.uKick.sonicpi).toBe('drum_heavy_kick')
    expect(BUILTIN_ALIASES.uSnare.sonicpi).toBe('drum_snare_hard')
    expect(BUILTIN_ALIASES.uTom.sonicpi).toEqual([
      'drum_tom_lo_hard',
      'drum_tom_mid_hard',
      'drum_tom_hi_hard',
    ])
  })

  it('omits the sonicpi slot for aliases with no canonical Sonic Pi sample', () => {
    expect(BUILTIN_ALIASES.uClap.sonicpi).toBeUndefined()
    expect(BUILTIN_ALIASES.uRim.sonicpi).toBeUndefined()
  })
})

describe('ALIAS_MAP — derived flat view (default engine)', () => {
  it('is the strudel flattening of the built-ins (back-compat constant)', () => {
    expect(DEFAULT_VIZ_ENGINE).toBe('strudel')
    expect(ALIAS_MAP).toEqual({
      uKick: 'bd',
      uSnare: 'sd',
      uHat: 'hh',
      uOpenHat: 'oh',
      uClap: 'cp',
      uRim: 'rim',
      uTom: ['lt', 'mt', 'ht'],
    })
  })
})

describe('resolveAliasesForEngine', () => {
  const custom: StoredSignalAliases = {
    kick: { strudel: ['bd', 'kick9'], sonicpi: ['drum_heavy_kick'] },
    lead: { strudel: 'sawtooth' }, // strudel-only custom alias
    perc: { sonicpi: ['drum_cowbell'] }, // sonicpi-only custom alias
  }

  it('merges built-ins + custom for strudel, custom winning', () => {
    const r = resolveAliasesForEngine(custom, 'strudel')
    expect(r.uKick).toBe('bd') // built-in
    expect(r.kick).toEqual(['bd', 'kick9']) // custom
    expect(r.lead).toBe('sawtooth')
    expect(r.perc).toBeUndefined() // no strudel slot
  })

  it('resolves the sonicpi engine to its own sound values', () => {
    const r = resolveAliasesForEngine(custom, 'sonicpi')
    expect(r.uKick).toBe('drum_heavy_kick') // built-in sonicpi slot
    expect(r.kick).toEqual(['drum_heavy_kick']) // custom sonicpi slot
    expect(r.perc).toEqual(['drum_cowbell'])
    expect(r.lead).toBeUndefined() // strudel-only custom → inert under sonicpi
    expect(r.uClap).toBeUndefined() // built-in with no sonicpi slot
  })

  it('a custom override of a built-in name wins on collision', () => {
    const r = resolveAliasesForEngine(
      { uKick: { strudel: 'tabla' } },
      'strudel',
    )
    expect(r.uKick).toBe('tabla')
  })

  it('empty custom map yields exactly the engine built-ins', () => {
    expect(resolveAliasesForEngine({}, 'strudel')).toEqual(ALIAS_MAP)
  })
})
