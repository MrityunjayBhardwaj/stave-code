/**
 * Phase 21 — T3 p5 named-signal wiring.
 *
 * Asserts, by RUNNING the compiled factory, that:
 *   1. `compileP5Code` returns a factory that accepts the new 6th
 *      `staveUniformsRef` arg (back-compat: also works WITHOUT it).
 *   2. A sketch reading bare `uKick` inside `draw()` reads FRESH after the
 *      underlying SignalBus value changes between two synthetic `draw()`
 *      invocations — i.e. it resolves through the inner `with (staveUniforms)`
 *      GETTER, NOT a stale compile-time const (the U2 trap).
 *   3. The full-lifecycle body's double-`with` compiles without throwing.
 *   4. The draw wrapper fires the bus tick EXACTLY ONCE per frame (never per
 *      uniform read — a getter-tick would double-tick).
 *   5. The legacy draw-body form exposes the same bare aliases (re-read each
 *      frame from inside the synthetic draw).
 *
 * We drive a REAL `SignalBus` directly (it is a pure module) and wrap it in a
 * `StaveUniforms` getter-object — the same shape `P5VizRenderer` builds — so
 * the bus logic stays testable without a real p5 instance or renderer.
 */

import { describe, it, expect, vi } from 'vitest'
import type { RefObject } from 'react'
import { compileP5Code } from '../p5Compiler'
import type {
  StaveUniforms,
  P5SignalAccessor,
  P5SignalReading,
} from '../p5Compiler'
import { SignalBus } from '../signals/SignalBus'
import type {
  HapStream,
  ContainerSize,
  PatternScheduler,
} from '../types'

// ---------------------------------------------------------------------------
// Harness — a minimal fake p5 + a real-bus-backed StaveUniforms
// ---------------------------------------------------------------------------

function makeFakeP5() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
    })
  const p: Record<string, unknown> = {
    width: 400,
    height: 300,
    windowWidth: 1024,
    windowHeight: 768,
    RGB: 'RGB-const',
    createCanvas: record('createCanvas'),
    colorMode: record('colorMode'),
    background: record('background'),
    ellipse: record('ellipse'),
    fill: record('fill'),
  }
  return { p, calls }
}

/** Build a `StaveUniforms` getter-object backed by a real bus — exactly the
 *  shape `P5VizRenderer` constructs. `__tick` counts how often the wrapper
 *  ticks so we can prove "once per frame, never per read". */
function makeStaveUniforms(bus: SignalBus): {
  uniforms: StaveUniforms
  tickCount: () => number
} {
  let ticks = 0
  const u = ((sound: string): P5SignalReading => bus.sound(sound)) as P5SignalAccessor
  u.track = (id: string): P5SignalReading => bus.track(id)
  Object.defineProperty(u, 'tracks', { get: () => bus.tracks, enumerable: true })
  Object.defineProperty(u, 'sounds', { get: () => bus.sounds, enumerable: true })
  // Master-mix DSP on `u` (Slice 2) — mirror the P5VizRenderer shape so the
  // harness exercises the same getters the renderer builds.
  Object.defineProperty(u, 'rms', { get: () => bus.master().rms, enumerable: true })
  Object.defineProperty(u, 'bass', { get: () => bus.master().bass, enumerable: true })
  Object.defineProperty(u, 'mid', { get: () => bus.master().mid, enumerable: true })
  Object.defineProperty(u, 'treble', { get: () => bus.master().treble, enumerable: true })
  Object.defineProperty(u, 'fft', { get: () => bus.master().fft, enumerable: true })
  Object.defineProperty(u, 'wave', { get: () => bus.master().wave, enumerable: true })

  const uniforms = {
    get uKick(): number {
      return bus.envValue('uKick')
    },
    get uSnare(): number {
      return bus.envValue('uSnare')
    },
    get uHat(): number {
      return bus.envValue('uHat')
    },
    get uOpenHat(): number {
      return bus.envValue('uOpenHat')
    },
    get uClap(): number {
      return bus.envValue('uClap')
    },
    get uRim(): number {
      return bus.envValue('uRim')
    },
    get uTom(): number {
      return bus.envValue('uTom')
    },
    get uKeyVelocity(): number {
      let max = 0
      for (const s of bus.sounds) {
        const v = bus.sound(s).velocity
        if (v > max) max = v
      }
      return max
    },
    get uRms(): number {
      return bus.master().rms
    },
    get uBass(): number {
      return bus.master().bass
    },
    get uMid(): number {
      return bus.master().mid
    },
    get uTreble(): number {
      return bus.master().treble
    },
    u,
  } as StaveUniforms
  Object.defineProperty(uniforms, '__tick', {
    value: (): void => {
      ticks += 1
      bus.tick()
      bus.refreshActive(bus.now())
      // Slice 2: readAudio AFTER refreshActive — mirrors P5VizRenderer's
      // __tick so DSP fields (rms/fft) are live in the harness too.
      bus.readAudio()
    },
    enumerable: false,
  })
  return { uniforms, tickCount: () => ticks }
}

function makeRefs(uniforms?: StaveUniforms) {
  const hapStreamRef = { current: null as HapStream | null }
  const analyserRef = { current: null as AnalyserNode | null }
  const schedulerRef = { current: null as PatternScheduler | null }
  const containerSizeRef = { current: { w: 800, h: 600 } as ContainerSize }
  const optionsRef = { current: {} as Record<string, unknown> }
  const staveUniformsRef = { current: uniforms } as { current: StaveUniforms }
  return {
    hapStreamRef: hapStreamRef as unknown as RefObject<HapStream | null>,
    analyserRef: analyserRef as unknown as RefObject<AnalyserNode | null>,
    schedulerRef: schedulerRef as unknown as RefObject<PatternScheduler | null>,
    containerSizeRef: containerSizeRef as unknown as RefObject<ContainerSize>,
    optionsRef: optionsRef as unknown as RefObject<Record<string, unknown>>,
    staveUniformsRef: staveUniformsRef as unknown as RefObject<StaveUniforms>,
  }
}

// ---------------------------------------------------------------------------

describe('compileP5Code — Phase 21 named signals (T3)', () => {
  it('returns a factory that accepts the new 6th staveUniforms arg', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)
    const factory = compileP5Code(`function draw() { background(uKick) }`)
    const refs = makeRefs(uniforms)
    // The factory must accept all 6 args without throwing.
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    expect(typeof sketchFn).toBe('function')
  })

  it('still compiles WITHOUT the 6th arg (back-compat — inert uniforms)', () => {
    const factory = compileP5Code(`function draw() { background(uKick) }`)
    const refs = makeRefs()
    // Omit the 6th arg entirely — the default inert object kicks in.
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
    )
    const { p } = makeFakeP5()
    expect(() => sketchFn(p as unknown as import('p5').default)).not.toThrow()
    // bare uKick resolves to 0 (inert) — no throw, draws with 0.
    const draw = (p as Record<string, unknown>).draw as () => void
    expect(() => draw()).not.toThrow()
  })

  it('does NOT throw compiling the double-with full-lifecycle body', () => {
    expect(() =>
      compileP5Code(`
        function setup() { createCanvas(stave.width, stave.height) }
        function draw() { background(uKick * 255) }
      `),
    ).not.toThrow()
  })

  // ── THE U2 OBSERVATION — frame-fresh getter, not a stale const ──────────
  it('reads bare uKick FRESH across two draws as the bus value changes', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)
    // Capture the live uKick the sketch sees each draw into an external array.
    const seen: number[] = []
    const factory = compileP5Code(
      `function draw() { stave.options.__sink(uKick) }`,
    )
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    // Wire a sink onto stave.options so the draw body can publish what it read.
    ;(refs.optionsRef as { current: Record<string, unknown> }).current = {
      __sink: (v: number) => seen.push(v),
    }
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    const draw = (p as Record<string, unknown>).draw as () => void

    // Bus state A: bump bd → uKick (alias) reads the bd envelope level.
    bus.bump({ s: 'bd', hap: { value: { gain: 1 } } })
    draw() // wrapper ticks once (decay 0.92), then user draw reads uKick
    const a = seen[seen.length - 1]

    // Bus state B: a clean bus with no further bump → next tick decays again.
    draw() // tick decays the existing level further; reads the LOWER value
    const b = seen[seen.length - 1]

    // The draw wrapper tick decays the env each frame; a stale compile-time
    // const would freeze at the first value. Fresh getter → a > b > 0.
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
    expect(b).toBeLessThan(a)
    // Concretely: after one tick the level is 0.92, after the second 0.92² —
    // both via the SAME getter, proving the read is per-frame, not frozen.
    expect(a).toBeCloseTo(0.92, 5)
    expect(b).toBeCloseTo(0.92 * 0.92, 5)
  })

  // ── Tick fires ONCE per frame, never per uniform read (U2) ──────────────
  it('ticks the bus exactly once per draw — not once per uniform read', () => {
    const bus = new SignalBus()
    const { uniforms, tickCount } = makeStaveUniforms(bus)
    // A draw that reads MANY uniforms in one frame.
    const factory = compileP5Code(
      `function draw() {
         const total = uKick + uSnare + uHat + uTom + uKeyVelocity
         background(total)
       }`,
    )
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    const draw = (p as Record<string, unknown>).draw as () => void
    draw()
    draw()
    draw()
    // 3 draws, each reading 5 uniforms → if the tick were getter-driven it
    // would fire 15×. The wrapper-driven tick fires exactly once per draw.
    expect(tickCount()).toBe(3)
  })

  // ── stave.u mirrors the bare u (D-02) ───────────────────────────────────
  it('mirrors u onto stave.u (D-02) — same accessor object', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)
    let bareU: unknown
    let staveU: unknown
    const factory = compileP5Code(
      `function draw() { stave.options.__capture(u, stave.u) }`,
    )
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    ;(refs.optionsRef as { current: Record<string, unknown> }).current = {
      __capture: (a: unknown, b: unknown) => {
        bareU = a
        staveU = b
      },
    }
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    ;((p as Record<string, unknown>).draw as () => void)()
    expect(bareU).toBe(uniforms.u)
    expect(staveU).toBe(uniforms.u)
  })

  // ── Legacy draw-body form exposes the same bare aliases, re-read each frame
  it('legacy body re-reads bare uKick from inside the synthetic draw', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)
    const seen: number[] = []
    // Legacy form: bare statements, NO `function draw`.
    const factory = compileP5Code(`stave.options.__sink(uKick)`)
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    ;(refs.optionsRef as { current: Record<string, unknown> }).current = {
      __sink: (v: number) => seen.push(v),
    }
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    const draw = (p as Record<string, unknown>).draw as () => void

    bus.bump({ s: 'bd', hap: { value: { gain: 1 } } })
    draw()
    const a = seen[seen.length - 1]
    draw()
    const b = seen[seen.length - 1]
    expect(a).toBeGreaterThan(0)
    expect(b).toBeLessThan(a)
  })

  // ── DSP fields (Slice 2, T3) — p5 reads u('bd').rms as a FRESH number ──────
  it('reads u("bd").rms FRESH across two analyser states, and exposes arrays as arrays', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)

    // A mutable fake analyser whose time-domain offset (→ rms) is switchable so
    // we can prove the p5 getter re-reads `bus.sound('bd').rms` fresh, not a
    // compile-time capture. A single track ($0) carries `bd`, so audioFor picks
    // the isolated analyser. Scheduler-key space ($0), NOT IREvent.trackId.
    let timeVal = 160 // (160-128)/128 ≈ 0.25 magnitude
    const analyser = {
      frequencyBinCount: 32,
      getByteFrequencyData: (arr: Uint8Array) => {
        const third = Math.floor(arr.length / 3)
        for (let i = 0; i < arr.length; i++) arr[i] = i < third ? 200 : 0
      },
      getByteTimeDomainData: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = timeVal
      },
    }
    const kickTrack: PatternScheduler = {
      now: () => 0,
      query: (b: number, e: number) =>
        0 >= b && 0 < e
          ? [
              {
                begin: 0,
                end: 0.1,
                endClipped: 0.1,
                note: 0,
                freq: 0,
                s: 'bd',
                gain: 1,
                velocity: 1,
                color: null,
              } as never,
            ]
          : [],
    } as unknown as PatternScheduler
    bus.bindScheduler(kickTrack as never, new Map([['$0', kickTrack as never]]))
    bus.bindAnalysers(analyser, new Map([['$0', analyser]]))

    // Capture what the sketch reads each draw: rms (scalar) + fft Array-ness.
    const seenRms: number[] = []
    const seenFftIsArray: boolean[] = []
    const seenRmsIsNumber: boolean[] = []
    const factory = compileP5Code(
      `function draw() {
         stave.options.__sink(u('bd').rms, Array.isArray(u('bd').fft), typeof u('bd').rms === 'number')
       }`,
    )
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    ;(refs.optionsRef as { current: Record<string, unknown> }).current = {
      __sink: (rms: number, fftIsArr: boolean, rmsIsNum: boolean) => {
        seenRms.push(rms)
        seenFftIsArray.push(fftIsArr)
        seenRmsIsNumber.push(rmsIsNum)
      },
    }
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    const draw = (p as Record<string, unknown>).draw as () => void

    // Frame 1: __tick → readAudio reads the analyser (timeVal 160). rms > 0.
    draw()
    const rms1 = seenRms[seenRms.length - 1]
    expect(rms1).toBeGreaterThan(0)
    // Shape: rms is a NUMBER, fft is an ARRAY (p5 D-01).
    expect(seenRmsIsNumber[seenRmsIsNumber.length - 1]).toBe(true)
    expect(seenFftIsArray[seenFftIsArray.length - 1]).toBe(true)

    // Switch the analyser's time-domain to a LOUDER offset and draw again.
    // A stale compile-time capture would freeze rms1; the fresh getter reads
    // the new analyser state → a DIFFERENT (larger) rms. This is the U2 proof.
    timeVal = 220 // (220-128)/128 ≈ 0.72 magnitude — much louder
    draw()
    const rms2 = seenRms[seenRms.length - 1]
    expect(rms2).toBeGreaterThan(rms1)
  })

  // ── Master DSP sugar (Slice 2, T3) — bare uRms getter + u.fft array ───────
  it('exposes bare uRms (master) as a fresh getter number and u.fft as an array', () => {
    const bus = new SignalBus()
    const { uniforms } = makeStaveUniforms(bus)
    const master = {
      frequencyBinCount: 32,
      getByteFrequencyData: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 180
      },
      getByteTimeDomainData: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 200
      },
    }
    bus.bindAnalysers(master, new Map())

    const seen: Array<{ uRms: number; uFftIsArr: boolean; uRmsIsNum: boolean }> =
      []
    const factory = compileP5Code(
      `function draw() {
         stave.options.__sink(uRms, Array.isArray(u.fft), typeof uRms === 'number')
       }`,
    )
    const refs = makeRefs(uniforms)
    const sketchFn = factory(
      refs.hapStreamRef,
      refs.analyserRef,
      refs.schedulerRef,
      refs.containerSizeRef,
      refs.optionsRef,
      refs.staveUniformsRef,
    )
    ;(refs.optionsRef as { current: Record<string, unknown> }).current = {
      __sink: (uRms: number, uFftIsArr: boolean, uRmsIsNum: boolean) =>
        seen.push({ uRms, uFftIsArr, uRmsIsNum }),
    }
    const { p } = makeFakeP5()
    sketchFn(p as unknown as import('p5').default)
    const draw = (p as Record<string, unknown>).draw as () => void
    draw()
    const last = seen[seen.length - 1]
    expect(last.uRms).toBeGreaterThan(0) // master rms from the live analyser
    expect(last.uRmsIsNum).toBe(true) // p5 shape: bare master scalar is a NUMBER
    expect(last.uFftIsArr).toBe(true) // u.fft (master spectrum) is an ARRAY
  })
})
