import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  installGlobalErrorCatch,
  __resetGlobalErrorCatchForTests,
} from '../globalErrorCatch'
import {
  getLogHistory,
  __resetEngineLogForTests,
} from '../engineLog'

const flush = (): Promise<void> =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()))

beforeEach(() => {
  __resetEngineLogForTests()
  __resetGlobalErrorCatchForTests()
})

describe('installGlobalErrorCatch', () => {
  it('routes a window error event into engineLog', async () => {
    installGlobalErrorCatch()
    const err = new Error('escaped everything')
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: err.message,
        error: err,
      }),
    )
    await flush()
    const history = getLogHistory()
    expect(history).toHaveLength(1)
    expect(history[0].level).toBe('error')
    expect(history[0].message).toContain('escaped everything')
  })

  it('routes an unhandled promise rejection into engineLog', async () => {
    installGlobalErrorCatch()
    const reason = new Error('lost in async')
    const promise = Promise.reject(reason)
    // Suppress the "unhandled rejection" noise from the runner.
    promise.catch(() => {})
    window.dispatchEvent(
      new Event('unhandledrejection') as PromiseRejectionEvent,
    )
    // PromiseRejectionEvent isn't polyfilled uniformly — dispatch a
    // plain Event and set `.reason` via a custom constructor below.
    class PRE extends Event {
      reason: unknown
      constructor(reason: unknown) {
        super('unhandledrejection', { cancelable: true })
        this.reason = reason
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      promise = promise as unknown as Promise<unknown>
    }
    window.dispatchEvent(new PRE(reason) as unknown as Event)
    await flush()
    const history = getLogHistory()
    const lost = history.find((e) => e.message.includes('lost in async'))
    expect(lost).toBeDefined()
    expect(lost?.level).toBe('error')
  })

  it('is idempotent — repeat install does not double-fire', async () => {
    installGlobalErrorCatch()
    installGlobalErrorCatch()
    const err = new Error('once')
    window.dispatchEvent(
      new ErrorEvent('error', { message: err.message, error: err }),
    )
    await flush()
    expect(getLogHistory()).toHaveLength(1)
  })

  it('ignores noise-only events (no error + no message)', async () => {
    installGlobalErrorCatch()
    window.dispatchEvent(new ErrorEvent('error', {}))
    await flush()
    expect(getLogHistory()).toHaveLength(0)
  })
})
