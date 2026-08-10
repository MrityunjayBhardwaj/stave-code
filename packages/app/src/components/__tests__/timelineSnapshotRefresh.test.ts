/**
 * #1221 — guard for the half of the #1193 fix that removes the CLASS.
 *
 * The other half (the engine's evaluate settling when the repl rejects) closes
 * the ONE trigger that was observed. This half — bounding the eval the snapshot
 * publish waits behind — is what survives the next never-settling await, from
 * wherever it comes. It shipped with no guard at all: nothing in the repo can
 * make `evaluateForTimeline` hang, so restoring the bare `await` reddened
 * nothing, which is the same shape that let #1193 live for weeks.
 *
 * ⚠ THE FIRST ARM REDDENS BY TIMING OUT, not by comparing a value. That is the
 * honest shape when the defect is a promise that never settles — there is no
 * wrong value to catch, only an absent one. Restore the unbounded await in
 * `publishSnapshotAfterBoundedEval` and this file hangs at vitest's timeout;
 * that is the break-check #1221 asks for, and it was run in both directions.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { publishSnapshotAfterBoundedEval } from '../timelineSnapshotRefresh'

/** A promise that never settles — the condition #1193 actually hit. */
const forever = (): Promise<never> => new Promise<never>(() => {})

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('publishSnapshotAfterBoundedEval', () => {
  it('publishes even when the eval never settles', async () => {
    const publish = vi.fn()

    await publishSnapshotAfterBoundedEval({
      evaluate: forever,
      publish,
      waitMs: 20,
    })

    // Reaching this line at all is the assertion: an unbounded await here does
    // not fail, it never returns.
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('publishes AFTER the eval resolves, and not before', async () => {
    const order: string[] = []
    let release = () => {}
    const evalDone = new Promise<void>((r) => {
      release = () => {
        order.push('eval')
        r()
      }
    })
    const publish = vi.fn(() => order.push('publish'))

    // A long ceiling: this arm must be settled by the eval, never by the clock.
    const pending = publishSnapshotAfterBoundedEval({
      evaluate: () => evalDone,
      publish,
      waitMs: 10_000,
    })

    await sleep(10)
    expect(publish).not.toHaveBeenCalled() // the wait is a real wait

    release()
    await pending

    expect(order).toEqual(['eval', 'publish'])
  })

  it('publishes when the eval rejects', async () => {
    const publish = vi.fn()

    await publishSnapshotAfterBoundedEval({
      evaluate: () => Promise.reject(new Error('boom')),
      publish,
      waitMs: 10_000,
    })

    // Settled by the rejection, not by the 10s ceiling — a rejecting eval must
    // cost nothing, the way #1193's did not.
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('publishes without evaluating when no eval is wanted', async () => {
    const publish = vi.fn()

    await publishSnapshotAfterBoundedEval({
      evaluate: null,
      publish,
      waitMs: 10_000,
    })

    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('does not publish a second time when a late eval finally lands', async () => {
    const publish = vi.fn()

    await publishSnapshotAfterBoundedEval({
      evaluate: () => sleep(80),
      publish,
      waitMs: 20,
    })
    expect(publish).toHaveBeenCalledTimes(1)

    // The eval is left running (nothing cancels it). It must not re-drive the
    // publish behind the caller's back — republishing a late eval is #1222, and
    // it is a deliberate follow-up, not something that happens by accident.
    await sleep(120)
    expect(publish).toHaveBeenCalledTimes(1)
  })
})

/**
 * The call-site pin.
 *
 * The arms above pin the ORDERING, which now lives in one unit they can reach.
 * What they cannot see is the WIRING: `refreshTimelineMarks` could be rewritten
 * to await the eval directly again and every arm above would stay green,
 * because none of them loads the component. That is #1221's own gap one level
 * up — so it gets the cheapest honest statement of the property, in the idiom
 * `src/__tests__/gateReach.test.ts` already uses in this package.
 *
 * ⚠ WHAT THIS IS AND IS NOT. It is a wiring assertion over source text, not a
 * behaviour test. It cannot say the bound WORKS — the arms above do that. It
 * can only say the production path still runs through the thing those arms
 * test. Neither one alone closes #1221.
 */
describe('#1221 — the production refresh path still routes through the bound', () => {
  const src = readFileSync(
    join(__dirname, '..', 'StrudelEditorClient.tsx'),
    'utf8',
  )

  it('awaits the bounded helper', () => {
    expect(src).toContain('await publishSnapshotAfterBoundedEval(')
  })

  it('never awaits evaluateForTimeline directly', () => {
    // The exact revert #1221 names. `evaluateForTimeline` may be reached only
    // as the `evaluate` thunk handed to the helper — never as the operand of an
    // await, which is what made the publish behind it conditional.
    const awaitsEvalDirectly = /await[^\n;]*\.evaluateForTimeline\s*\(/.test(src)
    expect(awaitsEvalDirectly).toBe(false)
  })
})
