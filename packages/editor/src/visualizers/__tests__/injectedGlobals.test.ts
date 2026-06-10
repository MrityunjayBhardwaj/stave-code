import { describe, it, expect } from 'vitest'
import {
  injectedGlobals,
  formatStaveInputs,
  injectedGlobalByToken,
} from '../injectedGlobals'
import type { VizRendererKind } from '../../workspace/vizLanguages'

const KINDS: VizRendererKind[] = ['p5', 'hydra', 'glsl']

describe('injectedGlobals catalogue', () => {
  it('has entries for every renderer kind', () => {
    for (const k of KINDS) expect(injectedGlobals(k).length).toBeGreaterThan(3)
  })

  // PV94 additive-floor guard: the catalogue must cover the named-signal surface
  // the builders inject. If a builder gains a signal, this list must too.
  const DRUMS = ['uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim', 'uTom']
  it('covers the drum-envelope + master-DSP signal floor on every kind', () => {
    for (const k of KINDS) {
      const tokens = new Set(injectedGlobals(k).flatMap((g) => g.tokens))
      for (const d of DRUMS) expect(tokens, `${k} missing ${d}`).toContain(d)
      for (const m of ['uRms', 'uBass', 'uMid', 'uTreble']) {
        expect(tokens, `${k} missing ${m}`).toContain(m)
      }
    }
  })

  it('p5 exposes the stave context handles + u accessor members', () => {
    const tokens = new Set(injectedGlobals('p5').flatMap((g) => g.tokens))
    for (const t of ['scheduler', 'analyser', 'hapStream', 'options', 'fft', 'wave', 'density', 'u', 'track', 'tracks', 'sounds', 'uKeyVelocity']) {
      expect(tokens).toContain(t)
    }
  })

  it('glsl exposes the ShaderToy uniforms + per-track helper', () => {
    const tokens = new Set(injectedGlobals('glsl').flatMap((g) => g.tokens))
    for (const t of ['iResolution', 'iTime', 'iMouse', 'iChannel0', 'uVelocity', 'uTrackCount', 'staveTrack']) {
      expect(tokens).toContain(t)
    }
  })

  it('hydra exposes the H() event reader + thunked signals', () => {
    const tokens = new Set(injectedGlobals('hydra').flatMap((g) => g.tokens))
    for (const t of ['H', 'u', 'track', 'scheduler', 'uKeyVelocity']) {
      expect(tokens).toContain(t)
    }
  })
})

describe('formatStaveInputs', () => {
  it('starts with the // Stave Inputs header and aligns comments', () => {
    for (const k of KINDS) {
      const block = formatStaveInputs(k)
      expect(block.startsWith('// Stave Inputs\n')).toBe(true)
      // every catalogued comment appears
      for (const g of injectedGlobals(k)) expect(block).toContain(`// ${g.comment}`)
    }
  })

  it('glsl block reads like ShaderToy uniforms', () => {
    const block = formatStaveInputs('glsl')
    expect(block).toContain('uniform float     iTime;')
    expect(block).toMatch(/uniform float\s+iTime;\s+\/\/ playback time/)
  })

  it('multi-line hydra decl keeps the comment on its last line only', () => {
    const block = formatStaveInputs('hydra')
    const drumLine = block.split('\n').find((l) => l.includes('stave.uClap'))
    expect(drumLine).toContain('// per-drum envelope thunks')
    // the first physical line of the multi-line decl has no comment
    expect(block).toContain('stave.uKick, stave.uSnare')
  })

  it('groups entries under section headers (scalar-vs-accessor visible)', () => {
    const p5 = formatStaveInputs('p5')
    expect(p5).toContain('// — context —')
    expect(p5).toContain('// — signals · bare scalars (0..1) —')
    expect(p5).toContain('// — signals · structured (on u) —')
    // order: the bare-scalar header precedes the structured header, and uKick
    // (bare) lands in scalars while u.fft lands in structured.
    expect(p5.indexOf('bare scalars')).toBeLessThan(p5.indexOf('structured (on u)'))
    expect(p5.indexOf('uKick')).toBeLessThan(p5.indexOf('u.fft'))
    expect(p5.indexOf('u.fft')).toBeGreaterThan(p5.indexOf('structured (on u)'))
  })

  it('ends with the scalar-vs-accessor rule line per kind', () => {
    expect(formatStaveInputs('p5')).toContain('// rule: bare uXxx = a single number')
    expect(formatStaveInputs('hydra')).toContain('// rule: bare stave.uXxx() = a single number')
    expect(formatStaveInputs('glsl')).toContain('// rule: scalars are floats')
  })

  it('every catalogued entry carries a group', () => {
    for (const k of KINDS) {
      for (const g of injectedGlobals(k)) expect(g.group, `${k} entry ${g.tokens[0]}`).toBeTruthy()
    }
  })
})

describe('injectedGlobalByToken', () => {
  it('resolves a drum envelope token to a live scalar (master env)', () => {
    const hit = injectedGlobalByToken('p5', 'uKick')
    expect(hit?.live).toEqual({ kind: 'scalar', read: 'env:uKick' })
  })

  it('resolves master DSP scalars', () => {
    expect(injectedGlobalByToken('glsl', 'uRms')?.live).toEqual({ kind: 'scalar', read: 'rms' })
    expect(injectedGlobalByToken('p5', 'uTreble')?.live).toEqual({ kind: 'scalar', read: 'treble' })
  })

  it('resolves master arrays (fft/wave) to a live array', () => {
    expect(injectedGlobalByToken('p5', 'fft')?.live).toEqual({ kind: 'array', read: 'fft' })
    expect(injectedGlobalByToken('p5', 'wave')?.live).toEqual({ kind: 'array', read: 'wave' })
  })

  it('resolves glsl iTime to the time spec', () => {
    expect(injectedGlobalByToken('glsl', 'iTime')?.live).toEqual({ kind: 'time' })
  })

  it('resolves uKeyVelocity / uVelocity to keyVelocity', () => {
    expect(injectedGlobalByToken('p5', 'uKeyVelocity')?.live).toEqual({ kind: 'scalar', read: 'keyVelocity' })
    expect(injectedGlobalByToken('glsl', 'uVelocity')?.live).toEqual({ kind: 'scalar', read: 'keyVelocity' })
  })

  it('returns a doc entry with null live for structural handles', () => {
    const hit = injectedGlobalByToken('p5', 'scheduler')
    expect(hit).not.toBeNull()
    expect(hit?.live).toBeNull()
  })

  it('returns null for a non-injected word', () => {
    expect(injectedGlobalByToken('p5', 'background')).toBeNull()
    expect(injectedGlobalByToken('glsl', 'vec3')).toBeNull()
  })
})
