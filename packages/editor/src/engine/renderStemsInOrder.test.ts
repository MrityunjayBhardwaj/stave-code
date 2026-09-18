// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderStemsInOrder } from './renderStemsInOrder'
import { SilentCaptureError } from './WavEncoder'

/**
 * #1409 — the stem export's ordering and failure handling, driven by a fake
 * render. Whether a stem SOUNDS is measured in the browser
 * (`packages/app/tests/bounce-paths.spec.ts`); these arms pin what no audio
 * reading can: that renders never overlap, and that one failure is one failure.
 */

/** A render that takes a turn of the event loop, and records how many run at once. */
function fakeRender(fail: (code: string) => unknown = () => null) {
  const state = { inFlight: 0, maxInFlight: 0, order: [] as string[] }
  const render = async (code: string) => {
    state.inFlight++
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
    try {
      await new Promise((r) => setTimeout(r, 1))
      state.order.push(code)
      const err = fail(code)
      if (err) throw err
      return { blob: `wav:${code}` }
    } finally {
      state.inFlight--
    }
  }
  return { render, state }
}

describe('renderStemsInOrder (#1409)', () => {
  it('never runs two renders at once — each holds the audio globals alone', async () => {
    const f = fakeRender()
    await renderStemsInOrder({ a: 'A', b: 'B', c: 'C' }, f.render)
    expect({ maxInFlight: f.state.maxInFlight, order: f.state.order }).toEqual({
      maxInFlight: 1,
      order: ['A', 'B', 'C'],
    })
  })

  it('one stem that fails does not cost the stems that rendered', async () => {
    const f = fakeRender((code) => (code === 'B' ? new Error('no pattern') : null))
    const out = await renderStemsInOrder({ a: 'A', b: 'B', c: 'C' }, f.render)
    expect(
      Object.entries(out).map(([k, o]) => [k, o.ok, o.ok ? o.blob : String(o.error)])
    ).toEqual([
      ['a', true, 'wav:A'],
      ['b', false, 'Error: no pattern'],
      ['c', true, 'wav:C'],
    ])
  })

  it('a silent stem keeps its error, so the refused take is reachable only by asking for it', async () => {
    const refused = new Blob(['RIFF'])
    const f = fakeRender((code) => (code === 'rest' ? new SilentCaptureError(0, 48000, refused) : null))
    const out = await renderStemsInOrder({ drums: 'drums', rest: 'rest' }, f.render)
    const rest = out.rest
    expect({
      ok: rest.ok,
      silent: !rest.ok && rest.error instanceof SilentCaptureError,
      refusedKept: !rest.ok && rest.error instanceof SilentCaptureError && rest.error.refused === refused,
      noBytesOnOutcome: !('refused' in rest) && !('blob' in rest),
    }).toEqual({ ok: false, silent: true, refusedKept: true, noBytesOnOutcome: true })
  })

  it('reports progress once per stem, in order, after it settles — failures included', async () => {
    const f = fakeRender((code) => (code === 'A' ? new Error('x') : null))
    const seen: Array<[string, number, number, number]> = []
    await renderStemsInOrder({ a: 'A', b: 'B' }, f.render, (stem, i, total) =>
      seen.push([stem, i, total, f.state.order.length])
    )
    // The fourth column is how many renders had finished when progress fired:
    // progress for stem i arrives after stem i, never before it.
    expect(seen).toEqual([
      ['a', 1, 2, 1],
      ['b', 2, 2, 2],
    ])
  })

  it('an empty set renders nothing and reports nothing', async () => {
    const f = fakeRender()
    const seen: string[] = []
    const out = await renderStemsInOrder({}, f.render, (s) => seen.push(s))
    expect({ out, seen, renders: f.state.order.length }).toEqual({ out: {}, seen: [], renders: 0 })
  })

  it('a cancel before a stem stops the set and throws the cancel (#1648)', async () => {
    const f = fakeRender()
    const controller = new AbortController()
    const cancelled = new Error('cancelled')
    const run = renderStemsInOrder({ a: 'A', b: 'B', c: 'C' }, f.render, (stem) => {
      if (stem === 'a') controller.abort()
    }, { signal: controller.signal, error: () => cancelled })
    await expect(run).rejects.toBe(cancelled)
    expect(f.state.order).toEqual(['A'])
  })

  it('a stem that throws while cancelled rethrows, rather than counting as one failed stem (#1648)', async () => {
    const controller = new AbortController()
    const thrown = new Error('render cancelled mid-stem')
    const f = fakeRender((code) => {
      if (code === 'B') {
        controller.abort()
        return thrown
      }
      return null
    })
    const run = renderStemsInOrder({ a: 'A', b: 'B', c: 'C' }, f.render, undefined, {
      signal: controller.signal,
      error: () => new Error('not this one'),
    })
    await expect(run).rejects.toBe(thrown)
    expect(f.state.order).toEqual(['A', 'B'])
  })

  it('without a cancel, a failure is still one failed stem (#1648 control)', async () => {
    const controller = new AbortController()
    const f = fakeRender((code) => (code === 'B' ? new Error('x') : null))
    const out = await renderStemsInOrder({ a: 'A', b: 'B', c: 'C' }, f.render, undefined, {
      signal: controller.signal,
      error: () => new Error('cancel'),
    })
    expect(Object.values(out).map((o) => o.ok)).toEqual([true, false, true])
  })
})
