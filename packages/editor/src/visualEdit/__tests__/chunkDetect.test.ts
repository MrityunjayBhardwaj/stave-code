import { describe, it, expect } from 'vitest'
import {
  detectChunk,
  detectAllChunks,
  isChunkFresh,
  parseTopLevel,
  docParses,
  classifyChunk,
  type ChunkInfo,
} from '../chunkDetect'

describe('chunkDetect — statement detection', () => {
  it('detects a labeled ($:) pattern statement at the cursor', () => {
    const doc = `$: s("bd*4").gain(0.6)`
    const c = detectChunk(doc, 5)!
    expect(c).not.toBeNull()
    expect(c.label).toBe('$')
    expect(c.headFn).toBe('s')
    expect(doc.slice(...c.statementRange)).toBe(doc)
  })

  it('detects a bare expression statement', () => {
    const doc = `note("c4 e4 g4")`
    const c = detectChunk(doc, 2)!
    expect(c.label).toBeNull()
    expect(c.headFn).toBe('note')
  })

  it('returns null when the cursor is outside any statement', () => {
    const doc = `s("bd")\n\n`
    expect(detectChunk(doc, doc.length)).toBeNull()
  })

  it('returns null (no throw) on a mid-keystroke syntax error', () => {
    expect(parseTopLevel('s("bd").gain(')).toBeNull()
    expect(docParses('s("bd").gain(')).toBe(false)
    expect(detectChunk('s("bd").gain(', 3)).toBeNull()
  })

  it('finds the right statement among several', () => {
    const doc = `s("bd")\n$: note("c4").gain(0.5)`
    const second = detectChunk(doc, doc.indexOf('note'))!
    expect(second.headFn).toBe('note')
    expect(second.label).toBe('$')
    expect(detectAllChunks(doc)).toHaveLength(2)
  })
})

describe('chunkDetect — nested in combinators (#395)', () => {
  const stackDoc = `$: stack(\n  s("hh*8").gain(0.3),\n  s("bd ~ sd ~").gain(0.5),\n  note("c3 e3").s("piano")\n).viz("wordfall")`

  it('binds the INNER drum track when the cursor is inside stack(...)', () => {
    const c = detectChunk(stackDoc, stackDoc.indexOf('bd ~ sd'))!
    expect(c.headFn).toBe('s')
    expect(c.miniString).toBe('bd ~ sd ~')
    expect(c.label).toBeNull() // nested target carries no `$:`
    // the chunk's range is the inner track expression, not the whole statement
    expect(doc(c, stackDoc)).toBe('s("bd ~ sd ~").gain(0.5)')
    expect(c.type).toBe('step')
  })

  it('binds the INNER melody track for note(...) inside stack(...)', () => {
    const c = detectChunk(stackDoc, stackDoc.indexOf('c3 e3'))!
    expect(c.headFn).toBe('note')
    expect(c.miniString).toBe('c3 e3')
    expect(c.type).toBe('roll')
    expect(doc(c, stackDoc)).toBe('note("c3 e3").s("piano")')
  })

  it('a cursor on the inner mini string still binds that inner track', () => {
    // mini is a Literal (not a CallExpression) → stays on the enclosing chain
    const c = detectChunk(stackDoc, stackDoc.indexOf('hh*8') + 1)!
    expect(c.headFn).toBe('s')
    expect(c.miniString).toBe('hh*8')
  })

  it('keeps the OUTER statement when the cursor is on the combinator head', () => {
    const c = detectChunk(stackDoc, stackDoc.indexOf('stack') + 1)!
    expect(c.headFn).toBe('stack')
    expect(c.label).toBe('$')
    expect(doc(c, stackDoc)).toBe(stackDoc)
  })

  it("a nested chunk's miniRange points at the inner mini (write-back target)", () => {
    const c = detectChunk(stackDoc, stackDoc.indexOf('bd ~ sd'))!
    expect(stackDoc.slice(c.miniRange![0], c.miniRange![1])).toBe('bd ~ sd ~')
    expect(isChunkFresh(stackDoc, c)).toBe(true)
  })

  it('a nested chunk goes STALE after its inner expression text changes', () => {
    const c = detectChunk(stackDoc, stackDoc.indexOf('bd ~ sd'))!
    const edited = stackDoc.replace('bd ~ sd ~', 'bd bd sd ~')
    expect(isChunkFresh(edited, c)).toBe(false)
  })

  it('descends through nested combinators (stack inside stack)', () => {
    const d = `$: stack(s("hh"), stack(s("bd*2"), note("c3"))).gain(0.4)`
    const c = detectChunk(d, d.indexOf('bd*2'))!
    expect(c.headFn).toBe('s')
    expect(c.miniString).toBe('bd*2')
    expect(doc(c, d)).toBe('s("bd*2")')
  })

  it('detectAllChunks still returns ONE chunk per top-level statement', () => {
    // nested detection is cursor-only; the doc-wide list is unchanged
    expect(detectAllChunks(stackDoc)).toHaveLength(1)
  })
})

/** slice a chunk's statementRange out of the doc */
function doc(c: ChunkInfo, source: string): string {
  return source.slice(c.statementRange[0], c.statementRange[1])
}

describe('chunkDetect — mini-notation extraction', () => {
  it('extracts the head string contents, quotes excluded, with correct range', () => {
    const doc = `s("bd ~ sd ~")`
    const c = detectChunk(doc, 1)!
    expect(c.miniString).toBe('bd ~ sd ~')
    expect(doc.slice(c.miniRange![0], c.miniRange![1])).toBe('bd ~ sd ~')
  })

  it('preserves single vs double quote style by excluding only the quote chars', () => {
    const doc = `s('bd*4')`
    const c = detectChunk(doc, 1)!
    // the range is INSIDE the quotes — writeback edits content without touching the user's quote style
    expect(c.miniString).toBe('bd*4')
    expect(doc[c.miniRange![0] - 1]).toBe("'")
  })
})

describe('chunkDetect — method chain + arg ranges', () => {
  it('collects the chain in source order with per-arg numeric ranges', () => {
    const doc = `s("bd").bank("rd").gain(0.6).speed(-2)`
    const c = detectChunk(doc, 1)!
    expect(c.chain.map((x) => x.name)).toEqual(['s', 'bank', 'gain', 'speed'])

    const gain = c.chain.find((x) => x.name === 'gain')!
    expect(gain.args[0].numeric).toBe(0.6)
    expect(doc.slice(gain.args[0].range[0], gain.args[0].range[1])).toBe('0.6')

    const speed = c.chain.find((x) => x.name === 'speed')!
    expect(speed.args[0].numeric).toBe(-2) // negated literal
    expect(doc.slice(speed.args[0].range[0], speed.args[0].range[1])).toBe('-2')
  })

  it('marks non-numeric args with numeric=null but keeps raw + range', () => {
    const doc = `s("bd").bank("rolandtr909")`
    const c = detectChunk(doc, 1)!
    const bank = c.chain.find((x) => x.name === 'bank')!
    expect(bank.args[0].numeric).toBeNull()
    expect(bank.args[0].raw).toBe(`"rolandtr909"`)
  })
})

describe('chunkDetect — freshness (the corruption guard)', () => {
  it('is fresh against the exact doc it was detected from', () => {
    const doc = `s("bd*4").gain(0.6)`
    const c = detectChunk(doc, 1)!
    expect(isChunkFresh(doc, c)).toBe(true)
  })

  it('is STALE after the statement text changes (offsets would corrupt)', () => {
    const doc = `s("bd*4").gain(0.6)`
    const c = detectChunk(doc, 1)!
    const edited = `s("bd*8").gain(0.6)` // same length, different text
    expect(isChunkFresh(edited, c)).toBe(false)
  })

  it('is stale after an upstream insertion shifts offsets', () => {
    const doc = `s("bd")\n$: note("c4")`
    const c = detectChunk(doc, doc.indexOf('note'))!
    const edited = `s("bd*4")\n$: note("c4")` // inserted before the chunk
    expect(isChunkFresh(edited, c)).toBe(false)
  })
})

describe('chunkDetect — classification', () => {
  const mk = (over: Partial<ChunkInfo>): ChunkInfo => ({
    statementRange: [0, 0],
    statementText: '',
    exprRange: [0, 0],
    label: null,
    headFn: null,
    miniRange: null,
    miniString: null,
    chain: [],
    type: 'unknown',
    ...over,
  })

  it('classifies s(...) with a mini string as step-grid', () => {
    expect(classifyChunk(mk({ headFn: 's', miniString: 'bd*4' }))).toBe('step')
  })

  it('classifies note(...)/n(...) with a mini string as piano-roll', () => {
    expect(classifyChunk(mk({ headFn: 'note', miniString: 'c4 e4' }))).toBe('roll')
    expect(classifyChunk(mk({ headFn: 'n', miniString: '0 2 4' }))).toBe('roll')
  })

  it('classifies a numeric-chain-only chunk as knobs', () => {
    expect(
      classifyChunk(
        mk({ headFn: 'sound', chain: [{ name: 'gain', args: [{ raw: '0.6', numeric: 0.6, range: [0, 0] }], range: [0, 0] }] }),
      ),
    ).toBe('knobs')
  })

  it('classifies an opaque pattern as unknown', () => {
    expect(classifyChunk(mk({ headFn: 'run', miniString: null }))).toBe('unknown')
  })

  it('end-to-end: a real drum line classifies as step', () => {
    const c = detectChunk(`$: s("bd ~ sd ~").gain(0.8)`, 5)!
    expect(c.type).toBe('step')
  })
})
