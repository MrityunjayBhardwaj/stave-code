import { describe, it, expect } from 'vitest'
import {
  injectedGlobals,
  formatStaveInputs,
  injectedGlobalByToken,
  buildVizInputRows,
} from '../injectedGlobals'
import type { VizInputRow } from '../injectedGlobals'
import type { VizRendererKind } from '../../workspace/vizLanguages'

const KINDS: VizRendererKind[] = ['p5', 'hydra', 'glsl']

describe('injectedGlobals catalogue', () => {
  it('has entries for every renderer kind', () => {
    for (const k of KINDS) expect(injectedGlobals(k).length).toBeGreaterThan(3)
  })

  // PV94 additive-floor guard: the catalogue must cover the named-signal surface
  // the builders inject. If a builder gains a signal, this list must too. #351 —
  // JS kinds (p5/hydra) now speak the `sig` namespace (bare drum scalars are
  // `sig.kick`…`sig.tom`); GLSL keeps the flat `uKick` uniform names.
  const JS_DRUMS = ['kick', 'snare', 'hat', 'openHat', 'clap', 'rim', 'tom']
  const GLSL_DRUMS = ['uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim', 'uTom']
  it('covers the drum-envelope + master-DSP signal floor on every kind', () => {
    for (const k of ['p5', 'hydra'] as VizRendererKind[]) {
      const tokens = new Set(injectedGlobals(k).flatMap((g) => g.tokens))
      for (const d of JS_DRUMS) expect(tokens, `${k} missing ${d}`).toContain(d)
      for (const m of ['rms', 'bass', 'mid', 'treble']) {
        expect(tokens, `${k} missing ${m}`).toContain(m)
      }
    }
    // GLSL keeps the flat shader-uniform names (the `u`=uniform prefix is honest).
    const glslTokens = new Set(injectedGlobals('glsl').flatMap((g) => g.tokens))
    for (const d of GLSL_DRUMS) expect(glslTokens, `glsl missing ${d}`).toContain(d)
    for (const m of ['uRms', 'uBass', 'uMid', 'uTreble']) {
      expect(glslTokens, `glsl missing ${m}`).toContain(m)
    }
  })

  it('p5 exposes the stave context handles + sig accessor members', () => {
    const tokens = new Set(injectedGlobals('p5').flatMap((g) => g.tokens))
    for (const t of ['scheduler', 'analyser', 'hapStream', 'options', 'fft', 'wave', 'density', 'sig', 'track', 'tracks', 'sounds', 'keyVelocity']) {
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
    for (const t of ['H', 'sig', 'track', 'scheduler', 'keyVelocity']) {
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
    const drumLine = block.split('\n').find((l) => l.includes('stave.sig.tom'))
    expect(drumLine).toContain('// per-drum envelope thunks')
    // the first physical line of the multi-line decl has no comment
    expect(block).toContain('stave.sig.kick, stave.sig.snare')
  })

  it('groups entries under section headers (scalar-vs-accessor visible)', () => {
    const p5 = formatStaveInputs('p5')
    expect(p5).toContain('// — context —')
    expect(p5).toContain('// — signals · scalars on sig (0..1) —')
    expect(p5).toContain('// — signals · structured (on sig) —')
    // order: the scalar header precedes the structured header, and sig.kick
    // (scalar) lands in scalars while sig.fft lands in structured.
    expect(p5.indexOf('scalars on sig')).toBeLessThan(p5.indexOf('structured (on sig)'))
    expect(p5.indexOf('sig.kick')).toBeLessThan(p5.indexOf('sig.fft'))
    expect(p5.indexOf('sig.fft')).toBeGreaterThan(p5.indexOf('structured (on sig)'))
  })

  it('ends with the scalar-vs-accessor rule line per kind', () => {
    expect(formatStaveInputs('p5')).toContain('// rule: every signal lives on sig')
    expect(formatStaveInputs('hydra')).toContain('// rule: every signal lives on stave.sig')
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
    // p5 speaks `sig` — the bare token is `kick`; GLSL keeps the flat `uKick`.
    expect(injectedGlobalByToken('p5', 'kick')?.live).toEqual({ kind: 'scalar', read: 'env:uKick' })
    expect(injectedGlobalByToken('glsl', 'uKick')?.live).toEqual({ kind: 'scalar', read: 'env:uKick' })
  })

  it('resolves master DSP scalars', () => {
    expect(injectedGlobalByToken('glsl', 'uRms')?.live).toEqual({ kind: 'scalar', read: 'rms' })
    expect(injectedGlobalByToken('p5', 'treble')?.live).toEqual({ kind: 'scalar', read: 'treble' })
  })

  it('resolves master arrays (fft/wave) to a live array', () => {
    expect(injectedGlobalByToken('p5', 'fft')?.live).toEqual({ kind: 'array', read: 'fft' })
    expect(injectedGlobalByToken('p5', 'wave')?.live).toEqual({ kind: 'array', read: 'wave' })
  })

  it('resolves glsl iTime to the time spec', () => {
    expect(injectedGlobalByToken('glsl', 'iTime')?.live).toEqual({ kind: 'time' })
  })

  it('resolves keyVelocity / uVelocity to keyVelocity', () => {
    expect(injectedGlobalByToken('p5', 'keyVelocity')?.live).toEqual({ kind: 'scalar', read: 'keyVelocity' })
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

describe('buildVizInputRows (#346 live drawer row model)', () => {
  const live = (rows: VizInputRow[]) => rows.filter((r): r is Extract<VizInputRow, { type: 'live' }> => r.type === 'live')
  const staticRows = (rows: VizInputRow[]) => rows.filter((r): r is Extract<VizInputRow, { type: 'static' }> => r.type === 'static')

  it('emits a header row when the group changes, in catalogue order', () => {
    const rows = buildVizInputRows('p5')
    const headers = rows.filter((r) => r.type === 'header').map((r) => (r as { group: string }).group)
    // one header per distinct group, no consecutive duplicates
    expect(headers).toEqual([...new Set(headers)])
    expect(headers[0]).toBe('context')
  })

  it('expands a live entry into one live row PER token (drums → 7 rows)', () => {
    const drums = live(buildVizInputRows('p5')).filter((r) =>
      ['kick', 'snare', 'hat', 'openHat', 'clap', 'rim', 'tom'].includes(r.token),
    )
    expect(drums).toHaveLength(7)
    // comment is attached to the first token of the entry only
    expect(drums[0].comment).toContain('per-drum envelope')
    expect(drums[1].comment).toBeNull()
  })

  it('namespaces the live label per kind (p5 sig., hydra thunk, glsl bare)', () => {
    const p5 = live(buildVizInputRows('p5')).find((r) => r.token === 'kick')
    const hydra = live(buildVizInputRows('hydra')).find((r) => r.token === 'kick')
    const glsl = live(buildVizInputRows('glsl')).find((r) => r.token === 'uKick')
    expect(p5?.label).toBe('sig.kick')
    expect(hydra?.label).toBe('sig.kick()')
    expect(glsl?.label).toBe('uKick')
  })

  it('carries the spec kind so the panel can pick a widget (bar/spark/seconds)', () => {
    const rows = live(buildVizInputRows('p5'))
    expect(rows.find((r) => r.token === 'rms')?.spec.kind).toBe('scalar')
    expect(rows.find((r) => r.token === 'fft')?.spec.kind).toBe('array')
    expect(live(buildVizInputRows('glsl')).find((r) => r.token === 'iTime')?.spec.kind).toBe('time')
  })

  it('keeps no-live entries as STATIC reference rows (sig accessor, density, context)', () => {
    const rows = buildVizInputRows('p5')
    const declText = staticRows(rows).map((r) => r.decl).join('\n')
    // the sig()/sig.track accessor, density, and the scheduler/analyser handles
    // carry no live spec → they stay documented as static rows, never live.
    expect(declText).toContain("sig('bd')")
    expect(declText).toContain('sig.density')
    expect(declText).toContain('stave.scheduler')
    const liveTokens = live(rows).map((r) => r.token)
    expect(liveTokens).not.toContain('density')
    expect(liveTokens).not.toContain('scheduler')
  })

  it('every live row references a real catalogue token + spec (additive floor)', () => {
    for (const k of KINDS) {
      for (const r of live(buildVizInputRows(k))) {
        expect(injectedGlobalByToken(k, r.token)?.live).toEqual(r.spec)
      }
    }
  })
})
