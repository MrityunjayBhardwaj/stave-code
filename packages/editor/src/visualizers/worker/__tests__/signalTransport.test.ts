/**
 * SignalTransport (postMessage) — envelope tagging, non-frame filtering, and an
 * end-to-end parity check THROUGH the real writer/reader (not structuredClone) so
 * the transport itself is in the loop (B-2a).
 */
import { describe, it, expect } from 'vitest'
import { SignalBus, type BusAnalyser } from '../../signals/SignalBus'
import { MainSignalSampler } from '../signalSampler'
import { WorkerBusFeed } from '../workerBusFeed'
import {
  createPostMessageWriter,
  createPostMessageReader,
  type FrameChannel,
} from '../signalTransport'

/** A synchronous duplex channel pair simulating Worker↔main postMessage. Each
 *  posted message is structured-cloned (the realistic serialization) before the
 *  other end's listeners see it. */
function channelPair(): { main: FrameChannel; worker: FrameChannel } {
  const mainHandlers = new Set<(ev: { data: unknown }) => void>()
  const workerHandlers = new Set<(ev: { data: unknown }) => void>()
  const mk = (
    here: Set<(ev: { data: unknown }) => void>,
    there: Set<(ev: { data: unknown }) => void>,
  ): FrameChannel => ({
    postMessage(message) {
      const data = structuredClone(message)
      there.forEach((h) => h({ data }))
    },
    addEventListener: (_t, h) => here.add(h),
    removeEventListener: (_t, h) => here.delete(h),
  })
  // main.postMessage → worker hears; worker.postMessage → main hears.
  return { main: mk(mainHandlers, workerHandlers), worker: mk(workerHandlers, mainHandlers) }
}

function stubAnalyser(bins: number, seed: number): BusAnalyser {
  const freq = new Uint8Array(bins)
  const time = new Uint8Array(bins)
  for (let i = 0; i < bins; i++) {
    freq[i] = (i * 3 + seed * 7) % 256
    time[i] = (128 + Math.round(80 * Math.sin((i + seed) * 0.3))) % 256
  }
  return {
    frequencyBinCount: bins,
    getByteFrequencyData: (a) => a.set(freq.subarray(0, a.length)),
    getByteTimeDomainData: (a) => a.set(time.subarray(0, a.length)),
  }
}

describe('SignalTransport (postMessage)', () => {
  it('delivers a frame writer → reader', () => {
    const { main, worker } = channelPair()
    const writer = createPostMessageWriter(main)
    const reader = createPostMessageReader(worker)
    let received = 0
    reader.onFrame(() => received++)

    const sampler = new MainSignalSampler()
    sampler.bind({ masterAnalyser: stubAnalyser(32, 1) })
    writer.writeFrame(sampler.sample())
    expect(received).toBe(1)
  })

  it('ignores non-frame messages on the same channel', () => {
    const { main, worker } = channelPair()
    createPostMessageWriter(main)
    const reader = createPostMessageReader(worker)
    let received = 0
    reader.onFrame(() => received++)
    // a B-3-style control message — must NOT reach the frame consumer.
    main.postMessage({ type: 'resize', w: 800, h: 600 }, [])
    expect(received).toBe(0)
  })

  it('end-to-end parity THROUGH the transport: worker bus master().rms == main bus', () => {
    const MASTER = stubAnalyser(64, 1)
    const NOW = 2.0

    // reference main-fed bus
    const ref = new SignalBus()
    ref.bindAnalysers(MASTER, new Map())
    ref.tick()
    ref.refreshActive(NOW)
    ref.readAudio()

    // worker-fed bus through the real writer/reader
    const { main, worker } = channelPair()
    const writer = createPostMessageWriter(main)
    const reader = createPostMessageReader(worker)
    const feed = new WorkerBusFeed()
    reader.onFrame((f) => feed.applyFrame(f))

    const sampler = new MainSignalSampler()
    sampler.bind({ masterAnalyser: MASTER })
    writer.writeFrame(sampler.sample())

    expect(feed.bus.master().rms).toBeCloseTo(ref.master().rms, 12)
    expect(feed.bus.master().fft).toEqual(ref.master().fft)
  })

  it('reader.dispose stops delivery', () => {
    const { main, worker } = channelPair()
    const writer = createPostMessageWriter(main)
    const reader = createPostMessageReader(worker)
    let received = 0
    reader.onFrame(() => received++)
    const sampler = new MainSignalSampler()
    sampler.bind({ masterAnalyser: stubAnalyser(16, 1) })
    writer.writeFrame(sampler.sample())
    reader.dispose()
    writer.writeFrame(sampler.sample())
    expect(received).toBe(1)
  })
})
