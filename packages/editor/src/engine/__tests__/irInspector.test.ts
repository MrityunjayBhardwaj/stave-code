import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  publishIRSnapshot,
  clearIRSnapshot,
  getIRSnapshot,
  subscribeIRSnapshot,
  type IRSnapshot,
} from '../irInspector'
import { IR } from '../../ir/PatternIR'

const sample = (): IRSnapshot => {
  const ir = IR.play('c4')
  return {
    ts: 1000,
    source: 'pattern.strudel',
    runtime: 'strudel',
    code: 'note("c4")',
    passes: [{ name: 'Parsed', ir }],
    ir, // alias of passes[last].ir per contract
    events: [],
  }
}

describe('irInspector store', () => {
  beforeEach(() => {
    clearIRSnapshot()
  })

  it('starts empty', () => {
    expect(getIRSnapshot()).toBeNull()
  })

  it('publish replaces the current snapshot', () => {
    publishIRSnapshot(sample())
    const s = getIRSnapshot()
    expect(s?.code).toBe('note("c4")')
    expect(s?.runtime).toBe('strudel')
  })

  it('subscribers fire on every publish', () => {
    const fn = vi.fn()
    subscribeIRSnapshot(fn)
    publishIRSnapshot(sample())
    publishIRSnapshot({ ...sample(), code: 'note("d4")' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clear notifies with null', () => {
    const fn = vi.fn()
    subscribeIRSnapshot(fn)
    publishIRSnapshot(sample())
    clearIRSnapshot()
    expect(fn).toHaveBeenLastCalledWith(null)
  })

  it('unsubscribe stops notifications', () => {
    const fn = vi.fn()
    const off = subscribeIRSnapshot(fn)
    off()
    publishIRSnapshot(sample())
    expect(fn).not.toHaveBeenCalled()
  })

  it('listener errors do not block other listeners', () => {
    const a = vi.fn(() => { throw new Error('boom') })
    const b = vi.fn()
    subscribeIRSnapshot(a)
    subscribeIRSnapshot(b)
    publishIRSnapshot(sample())
    expect(b).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------
  // passes[] schema (Phase 19-02)
  // -------------------------------------------------------------------

  it('round-trip preserves passes[]', () => {
    const snap = sample()
    publishIRSnapshot(snap)
    const got = getIRSnapshot()
    expect(got).not.toBeNull()
    expect(got!.passes).toHaveLength(1)
    expect(got!.passes[0].name).toBe('Parsed')
    expect(got!.passes[0].ir).toBe(snap.ir)
  })

  it('subscriber receives the new passes[] field', () => {
    const fn = vi.fn()
    subscribeIRSnapshot(fn)
    const snap = sample()
    publishIRSnapshot(snap)
    const received = fn.mock.calls[0][0] as IRSnapshot
    expect(received.passes).toEqual(snap.passes)
    expect(received.passes[0].name).toBe('Parsed')
  })

  it('ir alias matches passes[last] for single-pass snapshots', () => {
    const snap = sample()
    publishIRSnapshot(snap)
    const got = getIRSnapshot()!
    expect(got.ir).toBe(got.passes[got.passes.length - 1].ir)
  })

  it('multi-pass: ir alias matches passes[last]', () => {
    const irA = IR.play('c4')
    const irB = IR.play('d4')
    const snap: IRSnapshot = {
      ts: 1,
      source: 'pattern.strudel',
      runtime: 'strudel',
      code: 'note("c4 d4")',
      passes: [
        { name: 'A', ir: irA },
        { name: 'B', ir: irB },
      ],
      ir: irB, // alias of last
      events: [],
    }
    publishIRSnapshot(snap)
    const got = getIRSnapshot()!
    expect(got.passes).toHaveLength(2)
    expect(got.ir).toBe(got.passes[1].ir)
    expect(got.ir).toBe(irB)
  })

  it('schema sanity: a snapshot literal without passes fails tsc (compile-time check)', () => {
    // @ts-expect-error — `passes` is required on IRSnapshot.
    const bad: IRSnapshot = {
      ts: 0,
      runtime: 'strudel',
      code: '',
      ir: IR.play('c4'),
      events: [],
    }
    // Reference `bad` to silence noUnusedLocals while keeping the
    // ts-expect-error directive load-bearing (the literal above is the
    // sole reason this assignment is type-checked).
    expect(bad).toBeDefined()
  })
})
