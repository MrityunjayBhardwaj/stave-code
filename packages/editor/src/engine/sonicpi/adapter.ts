/**
 * SonicPiEngine adapter — wraps the standalone sonicPiWeb engine
 * to conform to Motif's LiveCodingEngine interface.
 *
 * Adaptations:
 *  - SuperSonic (scsynth WASM) loaded dynamically from CDN at init time.
 *    Uses Function constructor to prevent bundler interception.
 *  - sonicPiWeb's HapStream events forwarded to Motif's HapStream.
 *  - Audio and inlineViz components passed through from the raw engine.
 *  - Queryable disabled until CaptureScheduler supports full DSL context.
 *  - All lifecycle methods null-safe (components/play/stop/dispose work
 *    correctly before init).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at build time via relative path to sibling project
import { SonicPiEngine as RawSonicPiEngine } from '../../../../../../sonicPiWeb/src/engine/SonicPiEngine'

import type { LiveCodingEngine, EngineComponents } from '../LiveCodingEngine'
import { HapStream } from '../HapStream'

const SUPERSONIC_CDN = 'https://unpkg.com/supersonic-scsynth@latest'

/** Load an ES module from a URL without bundler interception. */
async function importFromCDN(url: string): Promise<Record<string, unknown>> {
  const load = new Function('url', 'return import(url)')
  return load(url)
}

export class SonicPiEngine implements LiveCodingEngine {
  private raw: RawSonicPiEngine | null = null
  private hapStream = new HapStream()
  private runtimeErrorHandler: ((err: Error) => void) | null = null
  private options: { schedAheadTime?: number }

  constructor(options?: { schedAheadTime?: number }) {
    this.options = options ?? {}
  }

  async init(): Promise<void> {
    if (this.raw) return

    let SuperSonicClass: unknown
    try {
      const mod = await importFromCDN(SUPERSONIC_CDN)
      SuperSonicClass = mod.SuperSonic ?? mod.default
    } catch {
      // Silent mode — engine works without audio (tests, offline)
    }

    this.raw = new RawSonicPiEngine({
      ...this.options,
      bridge: SuperSonicClass ? { SuperSonicClass: SuperSonicClass as never } : {},
    })

    await this.raw.init()

    // Forward raw engine's HapStream events into Motif's HapStream
    this.raw.components.streaming?.hapStream.on(
      (e: { hap: unknown; audioTime: number; audioDuration: number; scheduledAheadMs: number }) => {
        this.hapStream.emit(
          e.hap, e.audioTime, 2,
          e.audioTime + e.audioDuration,
          e.audioTime - e.scheduledAheadMs / 1000,
        )
      },
    )

    if (this.runtimeErrorHandler) {
      this.raw.setRuntimeErrorHandler(this.runtimeErrorHandler)
    }
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.raw) return { error: new Error('Call init() before evaluate()') }
    return this.raw.evaluate(code)
  }

  play(): void { this.raw?.play() }
  stop(): void { this.raw?.stop() }

  dispose(): void {
    this.hapStream.dispose()
    this.raw?.dispose()
    this.raw = null
  }

  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
    this.raw?.setRuntimeErrorHandler(handler)
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.hapStream },
    }
    if (!this.raw) return bag

    const rawComponents = this.raw.components

    if (rawComponents.audio) bag.audio = rawComponents.audio
    if (rawComponents.inlineViz) bag.inlineViz = rawComponents.inlineViz

    // Queryable pass-through — currently disabled because sonicPiWeb's
    // CaptureScheduler doesn't pass the full DSL context when re-executing
    // code in capture mode. When fixed upstream, uncomment:
    // if (rawComponents.queryable) bag.queryable = rawComponents.queryable

    return bag
  }
}
