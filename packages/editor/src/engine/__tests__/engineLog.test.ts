import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  emitLog,
  subscribeLog,
  getLogHistory,
  clearLog,
  __resetEngineLogForTests,
  type LogEntry,
} from '../engineLog'

beforeEach(() => {
  __resetEngineLogForTests()
})

describe('emitLog', () => {
  it('returns a LogEntry with generated id + ts', () => {
    const e = emitLog({
      level: 'error',
      runtime: 'strudel',
      message: 'boom',
    })
    expect(e.id).toMatch(/^log-/)
    expect(e.ts).toBeGreaterThan(0)
    expect(e.message).toBe('boom')
  })

  it('appends to history in chronological order', () => {
    emitLog({ level: 'info', runtime: 'p5', message: 'one' })
    emitLog({ level: 'info', runtime: 'p5', message: 'two' })
    const h = getLogHistory()
    expect(h.map((e) => e.message)).toEqual(['one', 'two'])
  })

  it('generates unique ids across rapid emits', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      ids.add(emitLog({ level: 'info', runtime: 'stave', message: String(i) }).id)
    }
    expect(ids.size).toBe(50)
  })

  it('bounds history at the cap', () => {
    for (let i = 0; i < 600; i++) {
      emitLog({ level: 'info', runtime: 'p5', message: `m${i}` })
    }
    const h = getLogHistory()
    expect(h.length).toBe(500)
    // Newest retained, oldest dropped
    expect(h[h.length - 1].message).toBe('m599')
    expect(h[0].message).toBe('m100')
  })
})

// Listener notifications are deferred to a microtask to prevent
// mid-commit React setState chains. `flush` yields the microtask queue.
const flush = () => new Promise<void>((r) => queueMicrotask(r))

describe('subscribeLog', () => {
  it('fires the listener with the emitted entry', async () => {
    const listener = vi.fn()
    subscribeLog(listener)
    const e = emitLog({ level: 'warn', runtime: 'hydra', message: 'hi' })
    await flush()
    expect(listener).toHaveBeenCalledOnce()
    const [entry, history] = listener.mock.calls[0] as [
      LogEntry,
      readonly LogEntry[],
    ]
    expect(entry).toEqual(e)
    expect(history.map((h) => h.message)).toEqual(['hi'])
  })

  it('unsubscribes cleanly', async () => {
    const listener = vi.fn()
    const off = subscribeLog(listener)
    off()
    emitLog({ level: 'info', runtime: 'stave', message: 'x' })
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not replay history to new subscribers', async () => {
    emitLog({ level: 'info', runtime: 'p5', message: 'pre' })
    await flush()
    const listener = vi.fn()
    subscribeLog(listener)
    expect(listener).not.toHaveBeenCalled()
    emitLog({ level: 'info', runtime: 'p5', message: 'post' })
    await flush()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('a thrown listener does not stop other listeners', async () => {
    const ok = vi.fn()
    subscribeLog(() => {
      throw new Error('rude')
    })
    subscribeLog(ok)
    emitLog({ level: 'info', runtime: 'stave', message: 'x' })
    await flush()
    expect(ok).toHaveBeenCalledOnce()
  })
})

describe('clearLog', () => {
  it('empties history and notifies with null', async () => {
    emitLog({ level: 'info', runtime: 'p5', message: 'a' })
    await flush()
    const listener = vi.fn()
    subscribeLog(listener)
    clearLog()
    expect(getLogHistory()).toEqual([])
    const [entry, history] = listener.mock.calls[0] as [
      LogEntry | null,
      readonly LogEntry[],
    ]
    expect(entry).toBeNull()
    expect(history).toEqual([])
  })
})

describe('suggestion metadata round-trips', () => {
  it('keeps suggestion + stack on the emitted entry', () => {
    const e = emitLog({
      level: 'error',
      runtime: 'p5',
      message: '`stave` is not defined.',
      suggestion: {
        name: 'save',
        docsUrl: '/docs/reference/p5/#save',
        example: 'save("out.png")',
      },
      stack: 'at evalSketch (sketch.js:5)',
      line: 5,
      source: 'Piano Roll.p5',
    })
    expect(e.suggestion?.name).toBe('save')
    expect(e.stack).toContain('evalSketch')
    expect(e.line).toBe(5)
  })
})
