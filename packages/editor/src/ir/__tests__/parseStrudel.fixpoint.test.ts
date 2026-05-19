import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import type { PatternIR } from '../PatternIR'

/**
 * Phase 20-17 E-1 — bounded least-fixpoint regression spec.
 *
 * The 4 proto synthetics from
 * `packages/app/tests/parity-corpus/_proto-d01.spec.ts` ported into the
 * editor's unit suite to lock the fixpoint loop's behaviour against
 * regression:
 *
 *   (b) forward-ref     → STRUCTURED   (iter-0 unresolves `a`, iter-1
 *                                       resolves `b` then iter-2 resolves
 *                                       `a` via the partial map; order-
 *                                       independent by construction)
 *   (c) cyclic          → Code         (occurs-check terminal: both
 *                                       bindings stay pending → return
 *                                       null → whole-program Code-fallback)
 *   (d) dup-key         → Code         (first-pass dup-key fence; the
 *                                       fixpoint never runs)
 *   OQ1-5c              → Code         (opaque + referenced; the OQ1
 *                                       NON-relax disposition shipped by
 *                                       E-1 — the relax probe was a 20-16
 *                                       prototype experiment, not the
 *                                       wave-E delivery)
 *
 * These tests pin the fixpoint discipline (Datalog: total + PTIME +
 * order-independent + occurs-check-stratified) at the editor level so a
 * future parser refactor that breaks any of the four shapes fails here
 * (parity-corpus only covers Bakery-realistic inputs; the synthetics
 * stress the loop invariant in isolation).
 */

/** Mirror parseStrudel's no-`$:` shape: Track('d1', inner). Returns inner. */
function unwrapTrackD1(ir: PatternIR): PatternIR {
  if (ir.tag !== 'Track') return ir
  return (ir as unknown as { body: PatternIR }).body
}

function isBareCode(ir: PatternIR): boolean {
  return ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined
}

describe('20-17 E-1 — buildBindingMap bounded least-fixpoint', () => {
  it('(b) forward-ref — `const a=b; const b=n("0"); stack(a)` STRUCTURED', () => {
    const code = 'const a=b\nconst b=n("0")\nstack(a)'
    const ir = parseStrudel(code)
    const inner = unwrapTrackD1(ir)
    // Order-independent: iter-0 cannot resolve `a` (refers to `b`,
    // unbound); iter-1 resolves `b` (literal n("0")); iter-2 resolves
    // `a` via the partial bindings map. Final expr `stack(a)` substitutes
    // the resolved `a` subtree → structured Stack.
    expect(isBareCode(inner)).toBe(false)
    expect(inner.tag).not.toBe('Code')
  })

  it('(c) cyclic — `const a=b; const b=a; stack(a,b)` Code (occurs-check terminal)', () => {
    const code = 'const a=b\nconst b=a\nstack(a,b)'
    const ir = parseStrudel(code)
    const inner = unwrapTrackD1(ir)
    // Both `a` and `b` stay pending across every iter (each RHS parses
    // to bareCode while the other is unresolved; once `!progress` exits
    // the loop, the post-fixpoint pending check returns null → graceful
    // Code-fallback). The whole-program fallback shape is bare Code.
    expect(isBareCode(inner)).toBe(true)
  })

  it('(d) dup-key — `var x=n("0"); var x=n("1"); stack(x)` Code (first-pass fence)', () => {
    const code = 'var x=n("0")\nvar x=n("1")\nstack(x)'
    const ir = parseStrudel(code)
    const inner = unwrapTrackD1(ir)
    // The dup-key fence (kept γ-3, byte-unchanged predicate) fires
    // during the first descriptor-build pass — the fixpoint never runs.
    expect(isBareCode(inner)).toBe(true)
  })

  it('OQ1-5c — `var d=makeBass(); const p=n("0"); stack(p)` Code (occurs-check on opaque RHS)', () => {
    const code = 'var d=makeBass()\nconst p=n("0")\nstack(p)'
    const ir = parseStrudel(code)
    const inner = unwrapTrackD1(ir)
    // `d`'s RHS `makeBass()` is opaque — parseExpression cannot lift it
    // (no recognised root + no chain shape). It stays pending across
    // every iter; the post-fixpoint pending check returns null. E-1
    // ships the NON-relax disposition (the proto's relax-unreferenced
    // toggle was a 20-16 design probe, NOT this wave's behaviour); the
    // whole-program Code-fallback is the locked outcome.
    expect(isBareCode(inner)).toBe(true)
  })
})
