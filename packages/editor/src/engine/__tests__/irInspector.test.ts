import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  publishIRSnapshot,
  clearIRSnapshot,
  getIRSnapshot,
  subscribeIRSnapshot,
  type IRSnapshot,
} from '../irInspector'
import { IR } from '../../ir/PatternIR'

const sample = (): IRSnapshot => ({
  ts: 1000,
  source: 'pattern.strudel',
  runtime: 'strudel',
  code: 'note("c4")',
  ir: IR.play('c4'),
  events: [],
})

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
})
