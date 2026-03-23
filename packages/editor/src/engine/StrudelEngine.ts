import { HapStream } from './HapStream'
import { LiveRecorder } from './LiveRecorder'
import { OfflineRenderer } from './OfflineRenderer'
import type { HapEvent } from './HapStream'
import type { PatternScheduler } from '../visualizers/types'
import type { LiveCodingEngine, EngineComponents } from './LiveCodingEngine'

type HapHandler = (event: HapEvent) => void

/**
 * Single source of truth for audio in struCode.
 * Wraps @strudel/webaudio (which wraps superdough) via webaudioRepl().
 *
 * API surface matches ARCHITECTURE.md.
 * One instance per page. Must be init()'d after a user gesture.
 */
export class StrudelEngine implements LiveCodingEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private repl: any = null
  private audioCtx: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private hapStream: HapStream = new HapStream()
  private initialized = false
  // Resolve function for the current in-flight evaluate() call
  private evalResolve: ((result: { error?: Error }) => void) | null = null
  // Runtime audio error handler (e.g. "sound X not found" during scheduling)
  private runtimeErrorHandler: ((err: Error) => void) | null = null
  // Sound names registered after init() — used for editor autocompletion
  private loadedSoundNames: string[] = []
  // Per-track PatternSchedulers captured during the last evaluate() call
  private trackSchedulers: Map<string, PatternScheduler> = new Map()
  // Per-track viz requests captured during the last evaluate() call
  private vizRequests: Map<string, string> = new Map()
  // Reference to superdough audio controller (set during init)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private audioController: any = null
  // Code from the last successful evaluate() — used by buildVizRequestsWithLines
  private lastEvaluatedCode: string = ''

  async init(): Promise<void> {
    if (this.initialized) return

    // Load all strudel modules up-front so evalScope can register their
    // exports (note, s, gain, stack, etc.) into globalThis.  The eval'd user
    // code runs inside Function() with no special scope, so every function it
    // calls must be a global.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod] = await Promise.all([
      import('@strudel/core') as Promise<any>,
      import('@strudel/mini') as Promise<any>,
      import('@strudel/tonal') as Promise<any>,
      import('@strudel/webaudio') as Promise<any>,
      import('@strudel/soundfonts') as Promise<any>,
      import('@strudel/xen') as Promise<any>,
      import('@strudel/midi') as Promise<any>,
    ])

    // Register all module exports into globalThis so eval'd patterns can use them
    // (note, s, gain, stack, etc. must be globals — user code runs in Function())
    // midi: uses onTrigger (additive) — highlighting still fires for every hap.
    //        enableWebMidi() is NOT called here; users call it explicitly (triggers browser permission prompt).
    // drawMod (@strudel/draw) intentionally excluded: it injects a full-screen canvas
    // into document.body (id="test-canvas") the first time any draw function runs.
    // struCode uses its own visualizer system, so strudel's canvas draw functions
    // (pianoroll, drawFrequencyScope, etc.) are not exposed to user code.
    await coreMod.evalScope(coreMod, miniMod, tonalMod, webaudioMod, soundfontsMod, xenMod, midiMod)

    // Set up mini-notation string parser (parses "c3 e3 g3" strings as patterns)
    miniMod.miniAllStrings()

    // Transpiler converts $: pattern syntax → pattern.p("$") and handles
    // mini-notation template literals. Required for $: to work correctly.
    const { transpiler } = await import('@strudel/transpiler')

    const { initAudio, getAudioContext, webaudioOutput, webaudioRepl } = webaudioMod

    await initAudio()
    // Register built-in oscillator synths (sine, sawtooth, square, triangle, user, one)
    // and noise generators (pink, white, brown, crackle).
    // Without this, superdough throws "sound sine not found! Is it loaded?"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(webaudioMod as any).registerSynthSounds()
    // Register ZZFX procedural sounds (zzfx, z_sine, z_sawtooth, z_triangle, z_square, z_tan, z_noise).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(webaudioMod as any).registerZZFXSounds()
    // Register all 128 GM soundfont instruments (piano, bass, guitar, strings, etc.).
    // Fonts are lazy-loaded from felixroos.github.io/webaudiofontdata on first use.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(soundfontsMod as any).registerSoundfonts()
    // Load Dirt-Samples manifest so bd, hh, sd, cp, rim, cr, rd etc. resolve at runtime.
    // Individual samples are lazy-loaded on first play; only the index JSON is fetched here.
    // Worklet-based effects (crush, coarse, distort, djf, bytebeat) are loaded by initAudio() above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (webaudioMod as any).samples('github:tidalcycles/Dirt-Samples/master')
    // Snapshot all registered sound names (synths + Dirt-Samples) for editor autocompletion.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const soundMapData: Record<string, unknown> = (webaudioMod as any).soundMap?.get() ?? {}
    this.loadedSoundNames = Object.keys(soundMapData).filter(k => !k.startsWith('_'))
    this.audioCtx = getAudioContext()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const audioCtx = this.audioCtx!

    // Tap superdough's master output for analysis.
    // connectToDestination() wires a node as a SOURCE into superdough's mix — wrong for
    // an analyser because nothing feeds into the analyser's INPUT, so it sees silence.
    // Correct approach: get the master destinationGain and connect it → analyserNode
    // as a side-tap. Audio still flows unchanged to audioCtx.destination.
    this.analyserNode = audioCtx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioController = (webaudioMod as any).getSuperdoughAudioController()
    this.audioController = audioController
    audioController.output.destinationGain.connect(this.analyserNode)

    // Wrap the native output trigger so we can fan events to HapStream subscribers
    const hapStream = this.hapStream
    const audioCtxRef = audioCtx

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedOutput = async (hap: any, time: number, cps: number, endTime: number, s: number) => {
      // Emit to all visualizers / highlighters BEFORE triggering audio
      hapStream.emit(hap, time, cps, endTime, audioCtxRef.currentTime)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (webaudioOutput as any)(hap, time, cps, endTime, s)
      } catch (err) {
        // Route scheduler-time errors (e.g. "sound X not found", "cannot parse as numeral")
        // through the registered handler so they surface in the editor UI, not just the console.
        const error = err instanceof Error ? err : new Error(String(err))
        this.runtimeErrorHandler?.(error)
      }
    }

    this.repl = webaudioRepl({
      transpiler,
      defaultOutput: wrappedOutput,
      onEvalError: (err: Error) => {
        this.evalResolve?.({ error: err })
        this.evalResolve = null
      },
    })

    this.initialized = true
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.initialized) await this.init()
    this.lastEvaluatedCode = code

    const capturedPatterns = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
    const capturedVizRequests = new Map<string, string>()
    let anonIndex = 0

    // Dynamic import — Pattern is from @strudel/core which is already loaded after init()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Pattern } = await import('@strudel/core') as any

    // Save current descriptor (may be value descriptor from previous injectPatternMethods)
    const savedDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'p')
    const savedVizDescriptor = Object.getOwnPropertyDescriptor(Pattern.prototype, 'viz')

    // Legacy viz names for backwards compat with Strudel's ._pianoroll(), ._scope(), etc.
    const legacyVizNames = ['pianoroll', 'punchcard', 'wordfall', 'scope', 'fscope', 'spectrum', 'spiral', 'pitchwheel', 'markCSS']
    const savedLegacyDescriptors = new Map<string, PropertyDescriptor | undefined>()

    // Install setter trap — fires when injectPatternMethods does Pattern.prototype.p = fn
    // This intercepts the assignment so we can wrap Strudel's fn with our capturing logic.
    // IMPORTANT: .viz() and legacy method wrappers are installed INSIDE this setter,
    // AFTER injectPatternMethods finishes — because injectPatternMethods overwrites
    // any .viz() we install beforehand (Strudel has its own .viz() from @strudel/draw).
    Object.defineProperty(Pattern.prototype, 'p', {
      configurable: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(strudelFn: (id: string) => any) {
        // NOW install .viz() wrapper — after injectPatternMethods has set Strudel's .viz()
        // Wrap Strudel's existing .viz() so it still renders, but also capture the viz name.
        const strudelViz = Pattern.prototype.viz // eslint-disable-line @typescript-eslint/no-explicit-any
        Object.defineProperty(Pattern.prototype, 'viz', {
          configurable: true,
          writable: true,
          value: function(this: any, vizName: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Extract viz name — Strudel's transpiler reifies string args into Patterns
            let resolvedName: string | undefined
            if (typeof vizName === 'string') {
              resolvedName = vizName
            } else if (vizName && vizName._Pattern) {
              // Reified Pattern — extract the original string value
              try {
                const haps = vizName.queryArc(0, 1)
                if (haps.length > 0) resolvedName = String(haps[0].value)
              } catch { /* ignore query errors */ }
            }
            // Chain to Strudel's .viz() if it exists
            const result = strudelViz ? strudelViz.call(this, vizName) : this
            // Tag the RETURNED pattern with the resolved viz name
            if (resolvedName) {
              result._pendingViz = resolvedName
            }
            return result
          },
        })

        // Install legacy ._pianoroll(), ._scope(), etc. wrappers AFTER injectPatternMethods
        for (const name of legacyVizNames) {
          const methodName = `_${name}`
          savedLegacyDescriptors.set(methodName, Object.getOwnPropertyDescriptor(Pattern.prototype, methodName))
          const strudelLegacy = (Pattern.prototype as any)[methodName] // eslint-disable-line @typescript-eslint/no-explicit-any
          Object.defineProperty(Pattern.prototype, methodName, {
            configurable: true,
            writable: true,
            value: function(this: any, ...args: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
              const result = strudelLegacy ? strudelLegacy.apply(this, args) : this
              result._pendingViz = name
              return result
            },
          })
        }

        // Wrap Strudel's .p() fn with our capturing logic
        Object.defineProperty(Pattern.prototype, 'p', {
          configurable: true,
          writable: true,
          value: function (this: any, id: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (typeof id === 'string' && !(id.startsWith('_') || id.endsWith('_'))) {
              let captureId = id
              if (id.includes('$')) {
                captureId = `$${anonIndex}`
                anonIndex++
              }
              capturedPatterns.set(captureId, this)

              // Resolve pending .viz() request — .viz() fires BEFORE .p() in chain
              if (this._pendingViz && typeof this._pendingViz === 'string') {
                capturedVizRequests.set(captureId, this._pendingViz)
                delete this._pendingViz
              }
            }
            return strudelFn.call(this, id)
          },
        })
      },
    })

    try {
      // repl.evaluate() never rejects — errors go to the onEvalError callback
      // set during repl construction. We bridge via evalResolve.
      const result = await new Promise<{ error?: Error }>((resolve) => {
        this.evalResolve = resolve
        this.repl.evaluate(code).then(() => {
          // If onEvalError didn't fire, evaluation succeeded
          if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
        })
      })

      if (!result.error) {
        // Build PatternSchedulers from captured patterns
        const sched = (this.repl as any).scheduler // eslint-disable-line @typescript-eslint/no-explicit-any
        this.trackSchedulers = new Map<string, PatternScheduler>()
        for (const [id, pattern] of capturedPatterns) {
          const captured = pattern // close over this specific pattern instance
          this.trackSchedulers.set(id, {
            now: () => sched.now(),
            query: (begin: number, end: number) => {
              try { return captured.queryArc(begin, end) } catch { return [] }
            },
          })
        }
        this.vizRequests = capturedVizRequests
      }

      return result
    } finally {
      // Always restore Pattern.prototype.p — even on error
      if (savedDescriptor) {
        Object.defineProperty(Pattern.prototype, 'p', savedDescriptor)
      } else {
        delete (Pattern.prototype as any).p // eslint-disable-line @typescript-eslint/no-explicit-any
      }

      // Restore Pattern.prototype.viz — same pattern as .p restoration above
      if (savedVizDescriptor) {
        Object.defineProperty(Pattern.prototype, 'viz', savedVizDescriptor)
      } else {
        delete (Pattern.prototype as any).viz // eslint-disable-line @typescript-eslint/no-explicit-any
      }

      // Restore legacy ._vizName() methods
      for (const [methodName, desc] of savedLegacyDescriptors) {
        if (desc) {
          Object.defineProperty(Pattern.prototype, methodName, desc)
        } else {
          delete (Pattern.prototype as any)[methodName] // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }
    }
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.hapStream },
    }
    if (this.analyserNode && this.audioCtx) {
      bag.audio = { analyser: this.analyserNode, audioCtx: this.audioCtx }
    }
    bag.queryable = {
      scheduler: this.getPatternScheduler(),
      trackSchedulers: this.trackSchedulers,
    }
    // Build inlineViz from vizRequests + line scanning
    if (this.vizRequests.size > 0 && this.lastEvaluatedCode) {
      bag.inlineViz = {
        vizRequests: this.buildVizRequestsWithLines(this.vizRequests, this.lastEvaluatedCode),
      }
    }
    return bag
  }

  /**
   * Scans code for $: blocks and maps each track's viz request to the line
   * after the last line of that block. Mirrors the line-scanning logic in
   * viewZones.ts but returns structured data instead of creating DOM zones.
   */
  private buildVizRequestsWithLines(
    requests: Map<string, string>,
    code: string,
  ): Map<string, { vizId: string; afterLine: number }> {
    const result = new Map<string, { vizId: string; afterLine: number }>()
    const lines = code.split('\n')
    let anonIndex = 0

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('$:')) continue

      const key = `$${anonIndex}`
      anonIndex++

      const vizId = requests.get(key)
      if (!vizId) continue

      // Find last line of this pattern block (continuation lines)
      let lastLineIdx = i
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next === '' || next.startsWith('$:') || next.startsWith('setcps')) break
        lastLineIdx = j
      }

      result.set(key, { vizId, afterLine: lastLineIdx + 1 }) // 1-indexed
    }

    return result
  }

  play(): void {
    this.repl?.scheduler?.start()
  }

  stop(): void {
    this.repl?.scheduler?.stop()
  }

  async record(durationSeconds: number): Promise<Blob> {
    if (!this.analyserNode || !this.audioCtx) {
      throw new Error('StrudelEngine not initialized — call init() first')
    }
    return LiveRecorder.capture(this.analyserNode, this.audioCtx, durationSeconds)
  }

  async renderOffline(
    code: string,
    duration: number,
    sampleRate?: number
  ): Promise<Blob> {
    return OfflineRenderer.render(
      code,
      duration,
      sampleRate ?? this.audioCtx?.sampleRate ?? 44100
    )
  }

  async renderStems(
    stems: Record<string, string>,
    duration: number,
    onProgress?: (stem: string, i: number, total: number) => void
  ): Promise<Record<string, Blob>> {
    const keys = Object.keys(stems)
    const sampleRate = this.audioCtx?.sampleRate ?? 44100

    const blobs = await Promise.all(
      keys.map(async (key, i) => {
        const blob = await OfflineRenderer.render(stems[key], duration, sampleRate)
        onProgress?.(key, i + 1, keys.length)
        return [key, blob] as [string, Blob]
      })
    )
    return Object.fromEntries(blobs)
  }

  getAnalyser(): AnalyserNode {
    if (!this.analyserNode) throw new Error('StrudelEngine not initialized')
    return this.analyserNode
  }

  getAudioContext(): AudioContext {
    if (!this.audioCtx) throw new Error('StrudelEngine not initialized')
    return this.audioCtx
  }

  on(_event: 'hap', handler: HapHandler): void {
    this.hapStream.on(handler)
  }

  off(_event: 'hap', handler: HapHandler): void {
    this.hapStream.off(handler)
  }

  getHapStream(): HapStream {
    return this.hapStream
  }

  /**
   * Returns a thin PatternScheduler wrapper around the Strudel scheduler.
   * Only available after evaluate() succeeds (scheduler.pattern is set then).
   */
  getPatternScheduler(): PatternScheduler | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sched = (this.repl as any)?.scheduler
    const pattern = sched?.pattern
    if (!sched || !pattern) return null
    return {
      now: () => sched.now(),
      query: (begin: number, end: number) => {
        try { return pattern.queryArc(begin, end) } catch { return [] }
      },
    }
  }

  /**
   * Returns per-track PatternSchedulers captured during the last evaluate() call.
   * Each $: block gets its own scheduler that queries its Pattern directly via queryArc.
   * Keys: anonymous "$:" → "$0", "$1"; named "d1:" → "d1".
   * Empty Map before first evaluate or after evaluate error.
   */
  getTrackSchedulers(): Map<string, PatternScheduler> {
    return this.trackSchedulers
  }

  /**
   * Returns per-track viz requests captured during the last evaluate() call.
   * Maps track keys ("$0", "$1", "d1") to viz descriptor IDs ("pianoroll", "scope").
   * Only patterns that called .viz("name") in user code appear in this map.
   * Empty Map before first evaluate or if no patterns use .viz().
   */
  getVizRequests(): Map<string, string> {
    return this.vizRequests
  }


  /** Register a handler for runtime audio errors (fires during scheduling, not evaluation). */
  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
  }

  /** Returns all sound names registered after init() — useful for editor autocompletion. */
  getSoundNames(): string[] {
    return this.loadedSoundNames
  }

  dispose(): void {
    this.repl?.scheduler?.stop()
    this.hapStream.dispose()
    this.analyserNode?.disconnect()
    this.initialized = false
    this.repl = null
  }
}
