// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { aliasSoundValue } from './aliases'

/**
 * #1635 — the alias step both output paths share. What reaches superdough is
 * measured in the browser (`packages/app/tests/bounce-paths.spec.ts`); these arms
 * pin the rule itself, which used to live inline in `wrappedOutput` only.
 */
describe('aliasSoundValue (#1635)', () => {
  it('rewrites a curated alias the sound map does not have, on a copy', () => {
    const value = { s: 'kick', gain: 0.5 }
    const out = aliasSoundValue(value, {})
    expect({
      value: out.value,
      resolution: out.resolution,
      inputUntouched: value.s,
      isCopy: out.value !== value,
    }).toEqual({
      value: { s: 'bd', gain: 0.5 },
      resolution: { from: 'kick', to: 'bd' },
      inputUntouched: 'kick',
      isCopy: true,
    })
  })

  it('a name the loaded sound map has wins over the alias', () => {
    const value = { s: 'kick' }
    const out = aliasSoundValue(value, { kick: {} })
    expect({ same: out.value === value, resolution: out.resolution }).toEqual({ same: true, resolution: undefined })
  })

  it('looks the sound map up lowercased, as superdough does', () => {
    expect({
      loaded: aliasSoundValue({ s: 'Kick' }, { kick: {} }).value,
      notLoaded: aliasSoundValue({ s: 'Kick' }, {}).value,
    }).toEqual({ loaded: { s: 'Kick' }, notLoaded: { s: 'bd' } })
  })

  it('resolves with no sound map at all', () => {
    expect(aliasSoundValue({ s: 'snare' }, undefined).value).toEqual({ s: 'sd' })
  })

  it('leaves values it cannot apply to untouched', () => {
    const noS = { note: 60 }
    const numericS = { s: 3 }
    const unknown = { s: 'bd' }
    expect({
      noS: aliasSoundValue(noS, {}).value === noS,
      numericS: aliasSoundValue(numericS, {}).value === numericS,
      unknown: aliasSoundValue(unknown, {}).value === unknown,
      nullValue: aliasSoundValue(null, {}).value,
      stringValue: aliasSoundValue('kick', {}).value,
      anyResolution: [noS, numericS, unknown].some((v) => aliasSoundValue(v, {}).resolution !== undefined),
    }).toEqual({ noS: true, numericS: true, unknown: true, nullValue: null, stringValue: 'kick', anyResolution: false })
  })
})
