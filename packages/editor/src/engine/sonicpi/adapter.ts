/**
 * Adapter that wraps sonicPiWeb's SonicPiEngine to conform to
 * Motif's LiveCodingEngine interface.
 *
 * Key adaptations:
 * 1. PatternScheduler.query() is SYNC in Motif but sonicPiWeb's
 *    capture scheduler is async. Solution: pre-capture during
 *    evaluate() and serve from cache.
 * 2. Uses Motif's HapStream (same emit signature).
 * 3. Passes through all ECS components unchanged.
 *
 * NOTE: This imports from sonicPiWeb via relative path.
 * In production, sonicPiWeb would be published as an npm package.
 * For development, the relative path avoids npm link issues with pnpm.
 */

// sonicPiWeb engine — relative path to sibling project
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved at build time, not by tsc directly
import { SonicPiEngine as RawSonicPiEngine } from '../../../../../../sonicPiWeb/src/engine/SonicPiEngine'
// @ts-ignore
import type { CapturedEvent } from '../../../../../../sonicPiWeb/src/engine/CaptureScheduler'

// Motif types
import type { LiveCodingEngine, EngineComponents } from '../LiveCodingEngine'
import type { PatternScheduler } from '../../visualizers/types'
import { HapStream } from '../HapStream'

export class SonicPiEngine implements LiveCodingEngine {
  private raw: RawSonicPiEngine
  private motifHapStream = new HapStream()
  private cachedEvents: CapturedEvent[] = []
  private schedulerStartTime = 0
  private runtimeErrorHandler: ((err: Error) => void) | null = null

  private initOptions: { schedAheadTime?: number }
  private rawCreated = false

  constructor(options?: { schedAheadTime?: number }) {
    this.initOptions = options ?? {}
    // raw engine created lazily in init() after SuperSonic is loaded
    this.raw = null as unknown as RawSonicPiEngine
  }

  async init(): Promise<void> {
    // Dynamically load SuperSonic from CDN (ES module, GPL — never bundled)
    let SuperSonicClass: unknown = undefined
    try {
      // @ts-ignore — CDN URL resolved at runtime by browser, not tsc
      const mod = await import(/* @vite-ignore */ 'https://unpkg.com/supersonic-scsynth@latest')
      SuperSonicClass = mod.SuperSonic ?? mod.default
    } catch (err) {
      console.warn('[SonicPi] SuperSonic CDN load failed — running without audio:', err)
    }

    // Create raw engine with SuperSonic class (or without for silent mode)
    if (!this.rawCreated) {
      this.raw = new RawSonicPiEngine({
        ...this.initOptions,
        bridge: SuperSonicClass ? { SuperSonicClass: SuperSonicClass as never } : {},
      })
      this.rawCreated = true
    }

    await this.raw.init()

    // Bridge: sonicPiWeb's HapStream events → Motif's HapStream
    const rawStreaming = this.raw.components.streaming
    if (rawStreaming) {
      rawStreaming.hapStream.on((event: { hap: unknown; audioTime: number; audioDuration: number; scheduledAheadMs: number }) => {
        this.motifHapStream.emit(
          event.hap,
          event.audioTime,
          2,
          event.audioTime + event.audioDuration,
          event.audioTime - (event.scheduledAheadMs / 1000)
        )
      })
    }
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    const result = await this.raw.evaluate(code)
    if (result.error) return result

    // NOTE: Pre-capture for queryable is disabled until sonicPiWeb's
    // CaptureScheduler passes the full DSL context (use_bpm, use_synth, etc.)
    // to the re-executed code. For now, SonicPiEngine runs as streaming-only —
    // scope/spectrum/spiral/pitchwheel work, pianoroll disabled.
    // TODO: Enable when CaptureScheduler is fixed in sonicPiWeb.
    this.cachedEvents = []

    this.schedulerStartTime = Date.now() / 1000
    return {}
  }

  play(): void { this.raw.play() }
  stop(): void { this.raw.stop() }

  dispose(): void {
    this.motifHapStream.dispose()
    this.raw.dispose()
  }

  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
    this.raw.setRuntimeErrorHandler(handler)
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.motifHapStream },
    }

    const rawAudio = this.raw.components.audio
    if (rawAudio) {
      bag.audio = rawAudio
    }

    if (this.cachedEvents.length > 0) {
      const cached = this.cachedEvents
      const startTime = this.schedulerStartTime

      const scheduler: PatternScheduler = {
        now: () => (Date.now() / 1000) - startTime,
        query: (begin: number, end: number) => {
          return cached
            .filter((e: CapturedEvent) => e.time >= begin && e.time < end)
            .map((e: CapturedEvent) => ({
              whole: { begin: e.time, end: e.time + 0.25 },
              part: { begin: e.time, end: e.time + 0.25 },
              value: e.params,
              context: {},
            }))
        },
      }

      bag.queryable = {
        scheduler,
        trackSchedulers: new Map(),
      }
    }

    const rawInlineViz = this.raw.components.inlineViz
    if (rawInlineViz) {
      bag.inlineViz = rawInlineViz
    }

    return bag
  }
}
