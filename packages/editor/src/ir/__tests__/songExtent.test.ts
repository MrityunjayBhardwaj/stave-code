import { describe, it, expect } from 'vitest'
import { IR, type PatternIR } from '../PatternIR'
import { songExtent } from '../songExtent'

const bd = IR.play('bd')
const arm = (weight: number, pattern: PatternIR = bd) => ({ weight, pattern })

describe('songExtent', () => {
  it('a document with no arrangement is a LOOP, not a zero-length song', () => {
    // The distinction the typed answer exists for: `0` cannot tell "ends
    // immediately" from "never ends". 96.7% of real documents land here.
    expect(songExtent(bd)).toEqual({ kind: 'loop' })
    expect(songExtent(IR.stack(bd, IR.play('sd')))).toEqual({ kind: 'loop' })
    expect(songExtent(null)).toEqual({ kind: 'loop' })
  })

  it('an arrangement is the SUM of its arm weights', () => {
    const ir = IR.arrange('arrange', [arm(4), arm(8), arm(16)])
    expect(songExtent(ir)).toEqual({ kind: 'arranged', cycles: 28 })
  })

  it('cat/slowcat arms weigh 1 each', () => {
    expect(songExtent(IR.arrange('cat', [arm(1), arm(1), arm(1)]))).toEqual({
      kind: 'arranged',
      cycles: 3,
    })
  })

  it('parallel tracks take the MAX, never the sum', () => {
    // Tracks sound together. Summing would report a 16-cycle document as 28.
    const a = IR.arrange('arrange', [arm(4), arm(8)]) // 12
    const b = IR.arrange('arrange', [arm(16)]) // 16
    expect(songExtent(IR.stack(a, b))).toEqual({ kind: 'arranged', cycles: 16 })
  })

  it('does NOT descend into arms — an arm TRUNCATES a longer inner arrangement', () => {
    // `arrange([2, pat])` plays 2 whole cycles of `pat` at its natural rate. An
    // 8-cycle arrangement inside a 2-cycle arm sounds for 2 cycles, so taking a
    // descending max would over-report by 4x.
    const inner = IR.arrange('arrange', [arm(8)])
    const outer = IR.arrange('arrange', [arm(2, inner)])
    expect(songExtent(outer)).toEqual({ kind: 'arranged', cycles: 2 })
  })

  it('Track and Loop are transparent', () => {
    const ir = IR.track('d1', IR.arrange('arrange', [arm(4), arm(4)]))
    expect(songExtent(ir)).toEqual({ kind: 'arranged', cycles: 8 })
  })

  it('slow() lengthens the arrangement and fast() shortens it', () => {
    const a = IR.arrange('arrange', [arm(4), arm(4)]) // 8
    expect(songExtent(IR.slow(2, a))).toEqual({ kind: 'arranged', cycles: 16 })
    expect(songExtent(IR.fast(4, a))).toEqual({ kind: 'arranged', cycles: 2 })
  })

  it('a degenerate scaling factor is ignored rather than propagated as NaN', () => {
    // A NaN extent reaching the modal is a truncation with no symptom.
    const a = IR.arrange('arrange', [arm(8)])
    expect(songExtent(IR.slow(0, a))).toEqual({ kind: 'arranged', cycles: 8 })
    expect(songExtent(IR.fast(Number.NaN, a))).toEqual({ kind: 'arranged', cycles: 8 })
  })

  it('an arrangement under an unparsed transform is OPAQUE, not measured', () => {
    // The Code node may be a time-scaling method Stave could not read. Reporting
    // its Σweight would silently truncate the bounce. Measured on the real
    // corpus: 3 of the 5 arranged documents are in exactly this shape.
    const a = IR.arrange('arrange', [arm(4), arm(4)])
    const opaque: PatternIR = {
      tag: 'Code',
      code: '.someUnknownMethod(2)',
      lang: 'strudel',
      via: { method: 'someUnknownMethod', args: '2', callSiteRange: [0, 0], inner: a },
    }
    expect(songExtent(opaque)).toEqual({ kind: 'opaque' })
  })

  it('one tainted arrangement invalidates the whole MAX', () => {
    // The result is a max, so an unmeasurable arm could be the longest one.
    // Being wrong towards `opaque` costs nothing; towards `arranged` it truncates.
    const clean = IR.arrange('arrange', [arm(4)])
    const dirty: PatternIR = {
      tag: 'Code',
      code: '.x()',
      lang: 'strudel',
      via: { method: 'x', args: '', callSiteRange: [0, 0], inner: IR.arrange('arrange', [arm(4)]) },
    }
    expect(songExtent(IR.stack(clean, dirty))).toEqual({ kind: 'opaque' })
  })

  it('a Code node with NO arrangement under it stays a loop', () => {
    // `opaque` means "there is an arrangement we cannot measure". A document
    // that is merely unparseable and has no arrangement is still just a loop,
    // and the UI treats loop and opaque alike anyway.
    expect(songExtent(IR.code('wat()'))).toEqual({ kind: 'loop' })
  })
})
