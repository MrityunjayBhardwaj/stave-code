/**
 * WorkerVizRenderer — viz OPTIONS must cross the worker boundary (#875).
 *
 * The main-thread renderer hands `components.options` straight to the p5 compiler
 * via a ref, so `stave.options` just works. The worker renderer had no equivalent:
 * the mount message never carried the bag and the host hardcoded `{}`, so from the
 * day worker rendering became the DEFAULT (#245) every `.viz(name, {…})` /
 * `._pianoroll({…})` / `.pianoroll({…})` option was silently dropped. Nothing
 * failed — the sketch simply drew its defaults.
 *
 * These tests pin the contract at the seam: what mount SENDS, and what update
 * re-sends when the bag changes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { WorkerVizRenderer } from '../renderers/WorkerVizRenderer'
import { setVizWorkerFactory } from '../vizWorkerFactory'
import type { EngineComponents } from '../../engine/LiveCodingEngine'

/** A Worker stand-in that records every control message posted to it. */
class FakeWorker {
  posted: Array<Record<string, unknown>> = []
  postMessage(msg: unknown): void {
    this.posted.push(msg as Record<string, unknown>)
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  terminate(): void {}
  /** Control messages only — the per-frame SignalFrames carry no `type`. */
  get control(): Array<Record<string, unknown>> {
    return this.posted.filter((m) => typeof m.type === 'string')
  }
  ofType(type: string): Array<Record<string, unknown>> {
    return this.control.filter((m) => m.type === type)
  }
}

let worker: FakeWorker

function mountWith(options: Record<string, unknown> | undefined): WorkerVizRenderer {
  const r = new WorkerVizRenderer('p5', 'function draw(){}', 'sketch.p5')
  const container = document.createElement('div')
  r.mount(container, { options } as Partial<EngineComponents>, { w: 400, h: 300 }, () => {})
  return r
}

beforeEach(() => {
  worker = new FakeWorker()
  setVizWorkerFactory(() => worker as unknown as Worker)
  // jsdom has no OffscreenCanvas transfer — stub the one call mount() makes.
  ;(HTMLCanvasElement.prototype as unknown as Record<string, unknown>).transferControlToOffscreen =
    function transferControlToOffscreen() {
      return {} as OffscreenCanvas
    }
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  setVizWorkerFactory(null)
  vi.unstubAllGlobals()
})

describe('WorkerVizRenderer — options across the worker boundary (#875)', () => {
  it('mount SENDS the options bag (it used to arrive as {} — the whole bug)', () => {
    mountWith({ background: '#cc1133', labels: 1 })
    const [mount] = worker.ofType('mount')
    expect(mount).toBeDefined()
    expect(mount.options).toEqual({ background: '#cc1133', labels: 1 })
  })

  it('mount sends {} when the zone has no options (not undefined)', () => {
    mountWith(undefined)
    expect(worker.ofType('mount')[0].options).toEqual({})
  })

  it('a non-cloneable option is DROPPED, not thrown — a function would DataCloneError the whole mount', () => {
    mountWith({ background: '#cc1133', fmt: (x: number) => x })
    const [mount] = worker.ofType('mount')
    // the viz survives, minus the key that could never have reached a worker anyway
    expect(mount.options).toEqual({ background: '#cc1133' })
  })

  it('update RE-SENDS when the bag changes (editing the {…} argument re-paints, no remount)', () => {
    const r = mountWith({ background: '#cc1133' })
    r.update({ options: { background: '#11cc33' } } as Partial<EngineComponents>)
    expect(worker.ofType('options')).toHaveLength(1)
    expect(worker.ofType('options')[0].options).toEqual({ background: '#11cc33' })
    // and no remount was needed to apply it
    expect(worker.ofType('mount')).toHaveLength(1)
  })

  it('update is SILENT when the bag is unchanged — update() runs on every re-publish', () => {
    const r = mountWith({ background: '#cc1133' })
    r.update({ options: { background: '#cc1133' } } as Partial<EngineComponents>)
    r.update({ options: { background: '#cc1133' } } as Partial<EngineComponents>)
    expect(worker.ofType('options')).toHaveLength(0)
  })

  it('key ORDER is not a change — an evaluate that re-orders the bag must not re-post', () => {
    const r = mountWith({ background: '#cc1133', labels: 1 })
    r.update({ options: { labels: 1, background: '#cc1133' } } as Partial<EngineComponents>)
    expect(worker.ofType('options')).toHaveLength(0)
  })

  it('REMOVING an option posts the shrunken bag (the host REPLACES, so the option stops applying)', () => {
    const r = mountWith({ background: '#cc1133' })
    r.update({ options: {} } as Partial<EngineComponents>)
    expect(worker.ofType('options')[0].options).toEqual({})
  })
})
