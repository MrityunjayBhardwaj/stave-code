/**
 * A document whose labels are all commented out or muted plays like a bare one
 * (#1686), so every bare statement is a Track of its own, anchored at itself.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'

function tracksOf(doc: string) {
  const ir = parseStrudel(doc)
  const roots = ir.tag === 'Stack' ? ir.tracks : [ir]
  return roots.map((t) => {
    if (t.tag !== 'Track') throw new Error(`not a Track: ${t.tag}`)
    const loc = t.loc?.[0]
    return { id: t.trackId, start: loc?.start, end: loc?.end, muted: !!t.muted, text: loc ? doc.slice(loc.start, loc.end) : '' }
  })
}

describe('#1686 — no live label: bare statements are Tracks too', () => {
  it('every commented label keeps its ghost and id; the bare statement is a Track at itself', () => {
    const doc = 'n("<A#2 C3 C4>").s("ptest")\n// $: chord("<Cm>")\n// $: s("bd*4")'
    expect(tracksOf(doc).map(({ id, text }) => [id, text.trim()])).toEqual([
      ['d3', 'n("<A#2 C3 C4>").s("ptest")'],
      ['d1', '// $: chord("<Cm>")'],
      ['d2', '// $: s("bd*4")'],
    ])
  })

  it('a label\'s range ends where the next statement begins — no two Tracks overlap', () => {
    for (const doc of [
      '// $: chord("<Cm>")\nn("c e").s("ptest")\ns("hh*8")',
      '_$: s("bd*4")\nn("c e g").s("ptest")',
      '_$: s("bd*4")\n\nn("c e g")\n_x: s("hh")',
    ]) {
      const ts = tracksOf(doc)
      expect(ts.length, doc).toBeGreaterThan(1)
      for (let i = 1; i < ts.length; i++) expect(ts[i - 1].end!, doc).toBeLessThanOrEqual(ts[i].start!)
    }
  })

  it('a muted label keeps its mute and its own body', () => {
    expect(tracksOf('_$: s("bd*4")\nn("c e g")')).toEqual([
      { id: 'd1', start: 0, end: 14, muted: true, text: '_$: s("bd*4")\n' },
      { id: 'd2', start: 14, end: 24, muted: false, text: 'n("c e g")' },
    ])
  })

  it('a label alone on its line takes the statement below as its body, as JavaScript does', () => {
    expect(tracksOf('_$:\n  s("bd*4")\nn("c")').map((t) => t.id)).toEqual(['d1', 'd2'])
  })

  it('declarations and transport calls take no row', () => {
    expect(tracksOf('setcps(0.5)\nlet x = 1\n// $: s("a")\nn("c")').map((t) => t.id)).toEqual(['d1', 'd2'])
  })

  it('a commented head\'s dangling chain is not a statement — it takes no second row on the ghost\'s line', () => {
    // reduced from archive `0/-uq47S3IOvLa`
    const doc = 'await initHydra();\n//$: note("c a")\n  .delay(.2)\n\n//$: s("bd")\n  .bank("x")'
    // `await initHydra()` is an unknown head, so it is a (silent) row, as in a
    // bare document (statementHeads.ts); the chain below the first ghost is not
    expect(tracksOf(doc).map((t) => [t.id, t.start])).toEqual([['d3', 0], ['d1', 19], ['d2', 50]])
  })

  it('control: a document with nothing but ghosts is unchanged', () => {
    expect(tracksOf('// $: s("a")\n// $: s("b")').map((t) => t.id)).toEqual(['d1', 'd2'])
  })

  it('control: one live label and the bare statements stay out', () => {
    expect(tracksOf('// $: s("a")\n$: s("b")\nn("c")').map((t) => t.id)).toEqual(['d1', 'd2'])
  })
})
