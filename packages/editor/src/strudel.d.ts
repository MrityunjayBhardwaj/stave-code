// Ambient declarations for Strudel packages that ship without TypeScript types.
// These are intentionally loose — the strudel API uses dynamic JS patterns.

declare module '@strudel/transpiler' {
  export function transpiler(code: string, options?: Record<string, unknown>): { output: string; [key: string]: unknown }
}

declare module '@strudel/core' {
  export function evaluate(
    code: string,
    options?: Record<string, unknown>
  ): Promise<{ pattern: unknown; error?: Error }>

  export class Pattern {
    [key: string]: unknown
  }

  export function register(name: string, fn: unknown): void
}

declare module '@strudel/webaudio' {
  export function initAudio(): Promise<void>
  export function getAudioContext(): AudioContext

  /**
   * Trigger function — NOT a factory. Signature: (hap, time, cps, endTime, s) => void
   * Pass as `defaultOutput` to webaudioRepl, or wrap it.
   */
  export const webaudioOutput: (
    hap: unknown,
    time: number,
    cps: number,
    endTime: number,
    s?: number
  ) => Promise<void>

  /**
   * Connect an AudioNode into superdough's master output chain.
   */
  export function connectToDestination(node: AudioNode, channels?: number[]): void

  /**
   * Creates a full repl (scheduler + evaluate) wired to webaudio output.
   */
  export function webaudioRepl(options?: {
    audioContext?: AudioContext
    defaultOutput?: unknown
    getTime?: () => number
    [key: string]: unknown
  }): {
    scheduler: {
      start(): void
      stop(): void
      pause(): void
      setCps(cps: number): void
      cps: number
    }
    evaluate(code: string, autostart?: boolean): Promise<void>
  }

  export class Scheduler {
    constructor(options: {
      audioContext: AudioContext
      onTrigger: (
        hap: unknown,
        time: number,
        cps: number,
        endTime: number
      ) => void
      [key: string]: unknown
    })
    setPattern(pattern: unknown): void
    start(): void
    stop(): void
  }
}

declare module '@strudel/mini' {
  // Side-effect only — registers mini() on import
}

// Source-level submodule paths — used by the parity harness to exercise
// the documented Strudel evaluator path under vitest. Loose any-typed:
// the parity test casts what it needs at use sites.
declare module '@strudel/core/evaluate.mjs' {
  export function evalScope(...args: unknown[]): Promise<unknown[]>
  export function evaluate(
    code: string,
    transpiler?: unknown,
    transpilerOptions?: unknown,
  ): Promise<{ pattern: unknown; mode: string; meta: unknown }>
  export const strudelScope: Record<string, unknown>
}

declare module '@strudel/core/pattern.mjs'
declare module '@strudel/core/signal.mjs'
declare module '@strudel/core/controls.mjs'
declare module '@strudel/mini/mini.mjs' {
  export const mini: (...args: unknown[]) => unknown
  export function miniAllStrings(): void
}

declare module '@strudel/tonal' {
  // Side-effect only — registers note(), s(), gain() etc. on import
}

declare module '@strudel/soundfonts' {
  export function registerSoundfonts(): void
  export function loadSoundfont(name: string): Promise<unknown>
  export function setSoundfontUrl(url: string): void
  export const soundfontList: string[]
}

declare module '@strudel/xen' {
  // Side-effect only — registers edo(), xen(), tuning() on Pattern prototype
}

declare module '@strudel/draw' {
  // Side-effect only — registers pianoroll(), scope(), tscope(), fscope() on Pattern prototype
}

declare module '@strudel/midi' {
  export function enableWebMidi(options?: Record<string, unknown>): Promise<void>
  export const WebMidi: unknown
}

declare module '@strudel/mondo' {
  // Side-effect only — registers mondo()/mondolang()/getLocations() via
  // evalScope on import. Added Phase 20-14 α; dynamic-imported in
  // StrudelEngine as Promise<any>. Untyped: upstream ships no .d.ts (#145).
}
