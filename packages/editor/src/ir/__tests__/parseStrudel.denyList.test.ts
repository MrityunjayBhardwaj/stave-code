import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { toStrudel } from '../toStrudel'
import type { PatternIR } from '../PatternIR'

/** Test-local recursive walker — find first node matching predicate.
 *  Mirrors the inline walker in parseStrudel.test.ts (no shared helper yet). */
function findNode(
  node: PatternIR,
  pred: (n: PatternIR) => boolean,
): PatternIR | undefined {
  if (pred(node)) return node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any
  const kids: PatternIR[] = []
  if (n.body && typeof n.body === 'object' && 'tag' in n.body) kids.push(n.body)
  if (n.value && typeof n.value === 'object' && 'tag' in n.value) kids.push(n.value)
  if (n.via?.inner) kids.push(n.via.inner)
  if (Array.isArray(n.tracks)) kids.push(...n.tracks.filter((c: unknown) => c && typeof c === 'object' && 'tag' in (c as object)))
  if (Array.isArray(n.children)) kids.push(...n.children.filter((c: unknown) => c && typeof c === 'object' && 'tag' in (c as object)))
  for (const k of kids) {
    const found = findNode(k, pred)
    if (found) return found
  }
  return undefined
}

const paramNode = (code: string, key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findNode(parseStrudel(code), (n) => n.tag === 'Param' && (n as any).key === key)
const fxNode = (code: string, name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findNode(parseStrudel(code), (n) => n.tag === 'FX' && (n as any).name === name)
const opaqueNode = (code: string, method: string) =>
  findNode(
    parseStrudel(code),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (n) => n.tag === 'Code' && (n as any).via?.method === method,
  )

describe('#928 — classify off-list controls from the registry (deny-list, Tier 2)', () => {
  // These are genuine @strudel/core controls that the ~24-entry whitelist
  // omitted → today they wrap as opaque Code and starve the structural views.
  it('.clip(1) → Param (was opaque)', () => {
    const p = paramNode('s("bd").clip(1)', 'clip')
    expect(p).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((p as any).value).toBe(1)
  })

  it('.sustain(0.3) → Param (was opaque)', () => {
    expect(paramNode('s("bd").sustain(0.3)', 'sustain')).toBeDefined()
  })

  it('.attack(0.01) → Param (was opaque)', () => {
    expect(paramNode('s("bd").attack(0.01)', 'attack')).toBeDefined()
  })

  it('an aliased control keeps the USER token (round-trip fidelity, not canonical)', () => {
    // rlp → roomlp canonically, but the node + round-trip must preserve `rlp`.
    const p = paramNode('s("bd").rlp(0.5)', 'rlp')
    expect(p).toBeDefined()
    expect(toStrudel(parseStrudel('s("bd").rlp(0.5)'))).toContain('.rlp(0.5)')
  })

  it('a pattern-arg control classifies via the universal parser', () => {
    // parseParamArg handles mini-notation strings → the control still models.
    expect(paramNode('s("bd").velocity("0.5 1")', 'velocity')).toBeDefined()
  })

  // --- Regression guards: curated arms must NOT regress under the fallback ---
  it('scale (a @strudel/tonal fn, isControlName=false) STILL classifies as Param', () => {
    expect(paramNode('s("bd").scale("major")', 'scale')).toBeDefined()
  })

  it('reverb (not a core control) STILL classifies as FX', () => {
    expect(fxNode('s("bd").reverb(0.5)', 'reverb')).toBeDefined()
  })

  // --- PV37 wrap-never-drop: the genuine residual STILL opaques ---
  it('an unknown method still wraps as opaque Code', () => {
    expect(opaqueNode('s("bd").bogusxyz(1)', 'bogusxyz')).toBeDefined()
    expect(paramNode('s("bd").bogusxyz(1)', 'bogusxyz')).toBeUndefined()
  })

  it('a control with a lambda/unmodellable arg still opaques (PV37)', () => {
    // parseParamArg returns null for a non-number/string/mini shape → opaque.
    expect(opaqueNode('s("bd").clip(x => x)', 'clip')).toBeDefined()
  })
})
