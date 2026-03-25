/**
 * SonicPiEngine adapter — wraps the standalone sonicPiWeb engine
 * to conform to Motif's LiveCodingEngine interface.
 *
 * Responsibilities of the ADAPTER (not the engine):
 *  - SuperSonic CDN loading (bundler-proof dynamic import)
 *  - HapStream bridging (sonicPiWeb events → Motif events)
 *  - Viz request capture (viz() injected here, not in the engine)
 *  - inlineViz component assembly (afterLine computed from code)
 *
 * The engine (sonicPiWeb) knows about music: play, sleep, sample.
 * The adapter knows about the editor: viz, components, highlighting.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at build time via relative path to sibling project
import { SonicPiEngine as RawSonicPiEngine } from '../../../../../../sonicPiWeb/src/engine/SonicPiEngine'

import type { LiveCodingEngine, EngineComponents } from '../LiveCodingEngine'
import { HapStream } from '../HapStream'
import type { HapEvent } from '../HapStream'

const SUPERSONIC_CDN = 'https://unpkg.com/supersonic-scsynth@latest'

/** Load an ES module from a URL without bundler interception. */
async function importFromCDN(url: string): Promise<Record<string, unknown>> {
  const load = new Function('url', 'return import(url)')
  return load(url)
}

/**
 * Parse code for viz requests. Supports two syntaxes:
 *  - Runtime: viz :scope (inside live_loop — Ruby) or viz("scope") (JS)
 *  - Comment: # @viz scope or // @viz scope (after a loop block)
 *
 * Returns Map<trackName, { vizId, afterLine }>
 */
function parseVizRequests(code: string): Map<string, { vizId: string; afterLine: number }> {
  const requests = new Map<string, { vizId: string; afterLine: number }>()
  const lines = code.split('\n')

  // Match both JS and Ruby live_loop declarations
  const loopPattern = /live_loop\s*(?:\(\s*["'](\w+)["']|:(\w+)\s)/

  // Track loop blocks: name → { startLine, endLine }
  const loopBlocks = new Map<string, { start: number; end: number }>()

  for (let i = 0; i < lines.length; i++) {
    const loopMatch = lines[i].match(loopPattern)
    if (loopMatch) {
      const name = loopMatch[1] ?? loopMatch[2]
      const start = i
      // Find closing: "end" for Ruby, "}" / ")" for JS
      let depth = 0
      let end = lines.length - 1
      for (let j = i; j < lines.length; j++) {
        if (/\bdo\b/.test(lines[j])) depth++
        if (/\bend\b/.test(lines[j])) depth--
        depth += (lines[j].match(/[{(]/g) ?? []).length
        depth -= (lines[j].match(/[})]/g) ?? []).length
        if (depth <= 0 && j > i) { end = j; break }
      }
      loopBlocks.set(name, { start, end })
    }
  }

  // Source 1: viz() function calls inside live_loop blocks
  const vizCallPattern = /\bviz\s+:(\w+)|viz\s*\(\s*["':]+(\w+)["']?\s*\)/
  for (const [name, block] of loopBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      const vizMatch = lines[i].match(vizCallPattern)
      if (vizMatch) {
        requests.set(name, {
          vizId: vizMatch[1] ?? vizMatch[2],
          afterLine: block.end + 1, // 1-indexed, after closing end/}
        })
        break // one viz per loop
      }
    }
  }

  // Source 2: Comment-based @viz (fallback for tracks without runtime viz)
  const commentVizPattern = /(?:\/\/|#)\s*@viz\s+(\w+)/
  for (let i = 0; i < lines.length; i++) {
    const vizMatch = lines[i].match(commentVizPattern)
    if (vizMatch) {
      // Find preceding loop
      let trackName = `track_${i}`
      for (let j = i - 1; j >= 0; j--) {
        const loopMatch = lines[j].match(loopPattern)
        if (loopMatch) {
          trackName = loopMatch[1] ?? loopMatch[2]
          break
        }
      }
      if (!requests.has(trackName)) {
        requests.set(trackName, { vizId: vizMatch[1], afterLine: i + 1 })
      }
    }
  }

  return requests
}

/**
 * Strip viz() calls from code before passing to the engine.
 * The engine doesn't know about viz — it's an adapter concern.
 */
function stripVizCalls(code: string): string {
  return code
    .replace(/^\s*viz\s+:\w+\s*$/gm, '')       // Ruby: viz :scope
    .replace(/^\s*viz\s*\(\s*["']\w+["']\s*\)\s*$/gm, '') // JS: viz("scope")
    .replace(/^\s*(?:\/\/|#)\s*@viz\s+\w+\s*$/gm, '')     // Comment: # @viz scope
}

export class SonicPiEngine implements LiveCodingEngine {
  private raw: RawSonicPiEngine | null = null
  private hapStream = new HapStream()
  private runtimeErrorHandler: ((err: Error) => void) | null = null
  private options: { schedAheadTime?: number }
  private vizRequests = new Map<string, { vizId: string; afterLine: number }>()

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
      // Silent mode — engine works without audio
    }

    this.raw = new RawSonicPiEngine({
      ...this.options,
      bridge: SuperSonicClass ? { SuperSonicClass: SuperSonicClass as never } : {},
    })

    await this.raw.init()

    // Forward sonicPiWeb's HapEvents into Motif's HapStream
    // sonicPiWeb emits flat HapEvents — forward directly via emitEvent()
    this.raw.components.streaming?.hapStream.on(
      (e: { audioTime: number; audioDuration: number; scheduledAheadMs: number;
             midiNote: number | null; s: string | null; color: string | null;
             loc: Array<{ start: number; end: number }> | null }) => {
        const event: HapEvent = {
          audioTime: e.audioTime,
          audioDuration: e.audioDuration,
          scheduledAheadMs: e.scheduledAheadMs,
          midiNote: e.midiNote,
          s: e.s,
          color: e.color,
          loc: e.loc,
        }
        this.hapStream.emitEvent(event)
      },
    )

    if (this.runtimeErrorHandler) {
      this.raw.setRuntimeErrorHandler(this.runtimeErrorHandler)
    }
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.raw) return { error: new Error('Call init() before evaluate()') }

    // Capture viz requests BEFORE stripping (adapter concern)
    this.vizRequests = parseVizRequests(code)

    // Strip viz calls — engine doesn't know about visualization
    const cleanCode = stripVizCalls(code)

    return this.raw.evaluate(cleanCode)
  }

  play(): void { this.raw?.play() }
  stop(): void { this.raw?.stop() }

  dispose(): void {
    this.hapStream.dispose()
    this.raw?.dispose()
    this.raw = null
    this.vizRequests.clear()
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

    if (this.vizRequests.size > 0) {
      bag.inlineViz = { vizRequests: this.vizRequests }
    }

    return bag
  }
}
