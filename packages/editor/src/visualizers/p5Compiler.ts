/**
 * p5 viz compiler — pure compilation logic with no renderer dependencies.
 *
 * Kept separate from `vizCompiler.ts` so that tests and tooling can
 * import the compile functions without pulling the full p5 /
 * gifenc / renderer stack through the module graph. (The same
 * isolation trick used by `namedVizBridge.ts` vs. `vizPresetBridge.ts`.)
 *
 * The descriptor wiring layer lives in `vizCompiler.ts` and calls
 * into here for the actual source-to-factory conversion.
 */

import type { HapStream } from '../engine/HapStream'
import type { PatternScheduler, ContainerSize } from './types'
import type { RefObject } from 'react'
import { emitLog } from '../engine/engineLog'
import {
  formatFriendlyError,
  parseStackLocation,
} from '../engine/friendlyErrors'
import { P5_DOCS_INDEX } from '../monaco/docs/p5'

/**
 * The live `stave` namespace handed to user p5 sketches. Fields are
 * implemented as getters over the renderer refs so reads always see
 * the current value.
 *
 * `width` and `height` expose the preview container's current
 * dimensions (NOT `window.innerWidth` / `innerHeight`, which is what
 * p5's built-in `windowWidth` / `windowHeight` track). Sketches
 * should use `createCanvas(stave.width, stave.height)` in setup so
 * the canvas matches the preview pane regardless of the browser
 * window size.
 */
interface StaveContext {
  readonly scheduler: PatternScheduler | null
  readonly analyser: AnalyserNode | null
  readonly hapStream: HapStream | null
  readonly width: number
  readonly height: number
}

/**
 * Detect whether a p5 code snippet uses the new full-lifecycle form
 * (`function setup/draw/preload` declarations) or is a legacy
 * draw-body snippet (bare statements that were historically
 * evaluated directly inside `p.draw`).
 *
 * We look for `function draw` specifically — if the user has
 * declared their own draw handler we assume they know what they're
 * doing and treat the whole snippet as a full sketch. Legacy
 * snippets without `function draw` get auto-wrapped with a default
 * setup + a draw body that contains the user's statements verbatim.
 */
export function isFullLifecycleSketch(code: string): boolean {
  // Tolerate leading whitespace, comments, and alternate formatting.
  // The key signal is: somewhere in the source, there's a
  // function declaration whose name is `draw`.
  return /\bfunction\s+draw\s*\(/.test(code)
}

/**
 * `new Function(args, body)` wraps the body with its own header, which
 * V8 generates as two lines:
 *
 *   function anonymous(p,stave
 *   ) {
 *     <body starts here on line 3>
 *
 * Every stack-parsed line coming out of a runtime error — and every
 * line number embedded in a p5 FES message — counts from that header.
 * We subtract this offset plus the wrapper-specific prefix count to
 * translate back into the user's original file.
 */
const NEW_FUNCTION_HEADER_LINES = 2

/**
 * Return the number of wrapper lines sitting between `function
 * anonymous(...)` and the start of the user's code. Call-sites that
 * need to translate a wrapped-body line back to a user-file line
 * subtract this value.
 *
 *   userLine = wrappedLine - getP5LineOffset(userCode)
 *
 * Clamps the result to at least 0 so a caller that forgets to guard
 * an already-too-small line doesn't produce a negative.
 */
export function getP5LineOffset(code: string): number {
  return isFullLifecycleSketch(code)
    ? FULL_LIFECYCLE_PREFIX_LINES + NEW_FUNCTION_HEADER_LINES
    : LEGACY_PREFIX_LINES + NEW_FUNCTION_HEADER_LINES
}

/**
 * Compile a p5 code string into a `P5SketchFactory`. The factory is
 * invoked once per mount by `P5VizRenderer` with the three ref objects
 * the renderer uses to bridge the engine component bag.
 *
 * Execution model:
 *
 *   1. Build a `stave` namespace whose fields are LIVE getters over
 *      the renderer refs. Reading `stave.analyser` inside `draw()`
 *      always returns the current `analyserRef.current`, so a refresh
 *      from `renderer.update(components)` is picked up without the
 *      sketch having to re-subscribe.
 *
 *   2. Wrap the user source inside a `with(p) { ... }` block so that
 *      bare p5 identifiers (`createCanvas`, `background`, `fill`,
 *      `width`, `height`, `mouseX`, `HSB`, `PI`, etc.) resolve to the
 *      matching members of the p5 instance. Functions declared inside
 *      a `with` block capture the object environment in their scope
 *      chain, so when `draw()` is later called by p5, `background(0)`
 *      still resolves to `p.background(0)`.
 *
 *   3. Return an object `{ setup, draw, preload }` containing the
 *      user's declared lifecycle functions. The outer sketch function
 *      assigns those onto the p5 instance so p5 picks them up through
 *      its instance-mode contract.
 *
 *   4. Legacy snippets (no `function draw`) are auto-wrapped: a
 *      default `setup()` creates a full-window canvas, and the
 *      user's code goes inside a synthetic `draw()`. Pre-existing
 *      viz presets written for the old compiler keep working.
 *
 *   5. Compile errors are caught and surfaced via a fallback sketch
 *      that renders the error message on the canvas. Runtime errors
 *      in user code bubble up to p5's own error handler, which the
 *      `P5VizRenderer.mount` path already catches.
 *
 * Non-strict mode note: `new Function` creates a non-strict function
 * unless the body begins with `'use strict'`. We intentionally do NOT
 * add strict mode because `with` is forbidden in strict mode, and
 * `with(p)` is central to letting users write idiomatic bare-name p5
 * code.
 */
export function compileP5Code(code: string, source?: string) {
  // Build the body ONCE per compile. The compiled function is reused
  // for every mount of this sketch (p5 calls it once per `new p5(...)`).
  const body = isFullLifecycleSketch(code)
    ? buildFullLifecycleBody(code)
    : buildLegacyBody(code)
  const lineOffset = getP5LineOffset(code)

  // Pre-validate syntax synchronously. Without this step, the factory
  // below defers the `new Function(body)` call until p5's instance
  // constructor invokes the sketch — the internal try/catch there
  // swallows the SyntaxError into `installErrorSketch`, so the error
  // only appears on the canvas. By throwing from compileP5Code, the
  // error propagates up through `compilePreset` into the useMemo
  // catch in CompiledVizMount where it becomes a proper engineLog
  // entry (Console row, toast, status-bar chip, Monaco squiggle).
  new Function('p', 'stave', body)

  // P5SketchFactory signature — fourth arg is the container-size ref
  // maintained by the renderer so `stave.width` / `stave.height`
  // expose the preview pane dimensions. Optional (and defaulted) so
  // callers that don't wire the ref still get a usable stave,
  // falling back to window.innerWidth / innerHeight.
  return (
    hapStreamRef: RefObject<HapStream | null>,
    analyserRef: RefObject<AnalyserNode | null>,
    schedulerRef: RefObject<PatternScheduler | null>,
    containerSizeRef: RefObject<ContainerSize> = {
      current: { w: 400, h: 300 },
    } as RefObject<ContainerSize>,
  ) => {

    return (p: unknown) => {
      // Live stave namespace — getters forward to the refs so reads
      // inside setup/draw/preload always see the CURRENT values.
      // Caching `const a = stave.analyser` in module scope still
      // stores a reference to whatever was live at cache time; to
      // stay safe, read `stave.*` inside the function body.
      const stave: StaveContext = {
        get scheduler(): PatternScheduler | null {
          return schedulerRef.current
        },
        get analyser(): AnalyserNode | null {
          return analyserRef.current
        },
        get hapStream(): HapStream | null {
          return hapStreamRef.current
        },
        get width(): number {
          return containerSizeRef.current?.w ?? 400
        },
        get height(): number {
          return containerSizeRef.current?.h ?? 300
        },
      }

      let lifecycle: {
        preload?: () => void
        setup?: () => void
        draw?: () => void
      }
      try {
        const compile = new Function('p', 'stave', body) as (
          p: unknown,
          stave: StaveContext,
        ) => typeof lifecycle
        lifecycle = compile(p, stave)
      } catch (err) {
        // Top-level runtime error inside the user sketch — the most
        // common shape is a ReferenceError from a typo'd identifier
        // (`new Mp()` instead of `new Map()`) at module scope. The
        // compile-time pre-validation at the top of compileP5Code
        // only catches SyntaxErrors; references resolve at execute
        // time. Two things happen here:
        //   1. Canvas fallback: `installErrorSketch` paints the
        //      error in the preview pane so a user who has the
        //      Console panel closed still sees something.
        //   2. engineLog bridge: `emitLog` pushes the error through
        //      the shared pipe (Console row, toast, status-bar chip,
        //      Monaco squiggle). Without this, the preview pane was
        //      the ONLY surface that showed the error.
        const error = err instanceof Error ? err : new Error(String(err))
        installErrorSketch(p, error.message)
        const parts = formatFriendlyError(error, 'p5', {
          index: P5_DOCS_INDEX,
        })
        const loc = parseStackLocation(error)
        const userLine =
          loc && lineOffset > 0 ? Math.max(1, loc.line - lineOffset) : loc?.line
        emitLog({
          level: 'error',
          runtime: 'p5',
          source,
          message: parts.message,
          suggestion: parts.suggestion,
          stack: parts.stack,
          line: userLine,
          column: loc?.column,
        })
        return
      }

      installLifecycle(p, lifecycle, source, lineOffset)
    }
  }
}

/**
 * Produce a function body for `new Function('p', 'stave', body)` that
 * evaluates a full-lifecycle sketch. The user's source is inlined
 * verbatim inside `with(p) { ... }`, so their `function setup/draw/
 * preload` declarations capture `p` (and therefore the bare p5
 * method names) in their scope chain. After the declarations, a
 * synthetic return collects whichever of the three lifecycle names
 * the user actually defined.
 *
 * `typeof X === 'function'` guards let us tolerate partial sketches —
 * a user who only wrote `draw` gets a working sketch with just draw.
 */
/**
 * Prefix preceding `${userCode}` in the full-lifecycle body template.
 * Counted at module load so the emit-time line offset tracks the
 * template verbatim (change the template → offset self-updates).
 */
const FULL_LIFECYCLE_PREFIX = '\nwith (p) {\n  '
const FULL_LIFECYCLE_PREFIX_LINES = (FULL_LIFECYCLE_PREFIX.match(/\n/g) || [])
  .length

function buildFullLifecycleBody(userCode: string): string {
  return `${FULL_LIFECYCLE_PREFIX}${userCode}
  return {
    setup: typeof setup === 'function' ? setup : undefined,
    draw: typeof draw === 'function' ? draw : undefined,
    preload: typeof preload === 'function' ? preload : undefined,
  }
}
  `
}

/**
 * Legacy auto-wrap: the user wrote bare draw-body statements (the
 * old compiler's contract). We produce a lifecycle object whose
 * `setup` creates a full-window canvas and whose `draw` runs the
 * user's statements inside `with(p)` every frame. `stave.scheduler`
 * / `stave.analyser` / `stave.hapStream` are also aliased to bare
 * `scheduler` / `analyser` / `hapStream` inside the draw body so
 * snippets written for the OLD compiler (which exposed those as
 * locals) keep working without modification.
 */
/** Prefix preceding `${userCode}` in the legacy draw-body template. */
const LEGACY_PREFIX = `
with (p) {
  return {
    setup: function () {
      createCanvas(p.windowWidth, p.windowHeight)
      colorMode(RGB)
    },
    draw: function () {
      const scheduler = stave.scheduler
      const analyser = stave.analyser
      const hapStream = stave.hapStream
      `
const LEGACY_PREFIX_LINES = (LEGACY_PREFIX.match(/\n/g) || []).length

function buildLegacyBody(userCode: string): string {
  return `${LEGACY_PREFIX}${userCode}
    },
    preload: undefined,
  }
}
  `
}

/**
 * Assign the compiled lifecycle functions onto the p5 instance. If
 * the user didn't supply `setup`, fall back to a default that just
 * creates a full-window canvas — without SOME setup, p5 throws.
 *
 * Each user lifecycle hook is wrapped in a try/catch that forwards
 * the error to `emitLog`. p5 v2 swallows draw-time throws internally
 * (sets `hitCriticalError`, halts the loop, never reaches the
 * browser console or FES). Without this wrap, a `translate(0, 0,
 * zoom)` where `zoom` is undefined just produced a black canvas and
 * dead silence — no Console row, no toast, no squiggle. The wrap
 * also keeps the tight per-frame flood in check: `emitLog`'s dedupe
 * collapses identical consecutive entries so 60fps of ReferenceError
 * becomes one Console row.
 */
function installLifecycle(
  p: unknown,
  lifecycle: { preload?: () => void; setup?: () => void; draw?: () => void },
  source: string | undefined,
  lineOffset: number,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pi = p as any
  const reportLifecycleError = (hook: string, err: unknown): void => {
    const error = err instanceof Error ? err : new Error(String(err))
    const parts = formatFriendlyError(error, 'p5', { index: P5_DOCS_INDEX })
    const loc = parseStackLocation(error)
    const userLine =
      loc && lineOffset > 0
        ? Math.max(1, loc.line - lineOffset)
        : loc?.line
    emitLog({
      level: 'error',
      runtime: 'p5',
      source,
      message: `${hook}(): ${parts.message}`,
      suggestion: parts.suggestion,
      stack: parts.stack,
      line: userLine,
      column: loc?.column,
    })
  }
  const wrap = (
    hook: string,
    fn: (() => void) | undefined,
  ): (() => void) | undefined => {
    if (!fn) return undefined
    return function (this: unknown, ...args: unknown[]) {
      try {
        return (fn as (...a: unknown[]) => unknown).apply(this, args)
      } catch (err) {
        reportLifecycleError(hook, err)
        // Swallow — returning normally lets p5 continue. The dedupe
        // in engineLog keeps per-frame floods from drowning the
        // Console panel; the user still sees one clear row.
      }
    }
  }
  if (lifecycle.preload) pi.preload = wrap('preload', lifecycle.preload)
  pi.setup =
    wrap('setup', lifecycle.setup) ??
    function () {
      pi.createCanvas(pi.windowWidth, pi.windowHeight)
    }
  if (lifecycle.draw) pi.draw = wrap('draw', lifecycle.draw)
}

/**
 * Replace the sketch with a tiny error-display sketch. Used as the
 * fallback when `new Function` itself throws (syntax error). Runtime
 * errors during draw/setup still bubble up through p5's own handler.
 */
function installErrorSketch(p: unknown, message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pi = p as any
  pi.setup = function () {
    pi.createCanvas(pi.windowWidth || 400, 160)
  }
  pi.draw = function () {
    pi.background(20, 20, 24)
    pi.noStroke()
    pi.fill(255, 120, 120)
    pi.textFont('monospace')
    pi.textSize(12)
    pi.text('p5 viz compile error:', 12, 24)
    pi.fill(230)
    pi.textSize(11)
    pi.text(message, 12, 48, pi.width - 24, pi.height - 60)
  }
}
