import { describe, it, expect } from 'vitest'
import { blockLabelAt, buildLabelBlockRequests } from '../labelBlocks'

describe('blockLabelAt', () => {
  it('matches column-0 label statements', () => {
    expect(blockLabelAt('$: note("c3")')).toBe('$')
    expect(blockLabelAt('foo: note("c3")')).toBe('foo')
    expect(blockLabelAt('$foo: note("c3")')).toBe('$foo')
    expect(blockLabelAt('d1: s("bd")')).toBe('d1')
    expect(blockLabelAt('x : y')).toBe('x') // whitespace before colon allowed
  })

  it('rejects indented lines (continuation / object keys)', () => {
    // The false-positive guard: an indented `key:` inside a multi-line arg
    // must NOT be read as a new block opener (#418).
    expect(blockLabelAt('  gain: 0.5,')).toBeNull()
    expect(blockLabelAt('\tpan: 0.2')).toBeNull()
    expect(blockLabelAt('  note("e3 g3"),')).toBeNull()
  })

  it('rejects non-label lines', () => {
    expect(blockLabelAt('note("c3").s("piano")')).toBeNull()
    expect(blockLabelAt('setcps(130/240)')).toBeNull()
    expect(blockLabelAt('samples("github:user/repo")')).toBeNull() // colon is inside the string
    expect(blockLabelAt(').viz("pianoroll")')).toBeNull()
    expect(blockLabelAt('')).toBeNull()
    expect(blockLabelAt('// $: comment')).toBeNull()
  })
})

describe('buildLabelBlockRequests — keying mirrors .p() capture', () => {
  it('anonymous $: → positional $N', () => {
    const code = `setcps(1)\n$: note("c3").viz("pianoroll")\n$: note("e3").viz("spiral")`
    const req = new Map([['$0', 'pianoroll'], ['$1', 'spiral']])
    const out = buildLabelBlockRequests(code, req)
    expect(out.get('$0')?.vizId).toBe('pianoroll')
    expect(out.get('$0')?.afterLine).toBe(2)
    expect(out.get('$1')?.vizId).toBe('spiral')
    expect(out.get('$1')?.afterLine).toBe(3)
  })

  it('named label → literal key (the #418 fix)', () => {
    const code = `foo: note("c3").viz("pianoroll")`
    const out = buildLabelBlockRequests(code, new Map([['foo', 'pianoroll']]))
    expect(out.get('foo')?.vizId).toBe('pianoroll')
    expect(out.get('foo')?.afterLine).toBe(1)
  })

  it('$label → positional $N (shares the anon counter)', () => {
    const code = `$foo: note("c3").viz("pianoroll")`
    const out = buildLabelBlockRequests(code, new Map([['$0', 'pianoroll']]))
    expect(out.get('$0')?.vizId).toBe('pianoroll')
  })

  it('mixed $: + named → both placed (the foot-gun, fixed)', () => {
    const code = `$: note("c3").viz("pianoroll")\nfoo: note("e3").viz("spiral")`
    const req = new Map([['$0', 'pianoroll'], ['foo', 'spiral']])
    const out = buildLabelBlockRequests(code, req)
    expect(out.size).toBe(2)
    expect(out.get('$0')?.vizId).toBe('pianoroll')
    expect(out.get('foo')?.vizId).toBe('spiral')
    expect(out.get('foo')?.afterLine).toBe(2)
  })

  it('positional counter advances for $-labels even without a viz request', () => {
    // First $: has no viz; second does → it must still be keyed $1, matching
    // the capture side which increments anonIndex per `.p('$')` call.
    const code = `$: note("c3")\n$: note("e3").viz("spiral")`
    const out = buildLabelBlockRequests(code, new Map([['$1', 'spiral']]))
    expect(out.get('$1')?.vizId).toBe('spiral')
    expect(out.get('$0')).toBeUndefined()
  })

  it('multi-line block with an indented object key does not split the block', () => {
    const code = [
      '$: note("c3 e3")',
      '  .s("sawtooth")',
      '  .lpf(800)',
      '  .viz("pianoroll")',
    ].join('\n')
    const out = buildLabelBlockRequests(code, new Map([['$0', 'pianoroll']]))
    // afterLine is the line AFTER the .viz() line (4 → zone after line 4).
    expect(out.get('$0')?.afterLine).toBe(4)
  })

  it('block ends at setcps / next label', () => {
    const code = `foo: note("c3").viz("pianoroll")\nsetcps(2)\n$: note("e3").viz("spiral")`
    const req = new Map([['foo', 'pianoroll'], ['$0', 'spiral']])
    const out = buildLabelBlockRequests(code, req)
    expect(out.get('foo')?.afterLine).toBe(1)
    expect(out.get('$0')?.afterLine).toBe(3)
  })
})
