/**
 * evalHarness — located haps OUTSIDE the browser, in the order that gets them
 * right. TEST SUPPORT ONLY: the live app evaluates through `StrudelEngine`,
 * which already has all of this; this exists so the resolver's calibration can
 * be measured over real documents in a headless run.
 *
 * Five steps, four of which fail SILENTLY when skipped — wrong numbers, never an
 * error. Each failure mode below has been hit at least once for real:
 *
 *  1. `evalScope` EXACTLY the modules the live engine registers
 *     (`StrudelEngine.ts:267-295`) — no more and no fewer. Passing `{ mini }`
 *     alone throws; passing too few produces a chain-method "is not a function"
 *     per tune, which reads as a corpus property rather than a setup bug. And
 *     passing MORE is the same fault mirrored: this harness used to call
 *     `miniAllStrings()`, which the engine never calls, and that single extra
 *     line manufactured a parse failure for a real document whose only sin was
 *     a single-quoted emoji label. A measurement instrument that is more
 *     capable than the thing it measures is not a safer instrument.
 *  2. PASS THE TRANSPILER — `evaluate(code, transpiler)`, never `evaluate(code)`.
 *     Without it, locations are MINI-relative rather than document-space, AND
 *     `$:` never becomes `.p`, so nothing is collected and every count reads
 *     zero. That single omission once produced a probe that returned all zeros
 *     and passed its own assertions.
 *  3. MIRROR THE REPL. `evaluate()` returns only the LAST expression; the live
 *     repl stacks everything `.p` collected (`repl.mjs:238-250`), applies
 *     `each`, then the `all` transforms. Querying the return value directly
 *     reports "no location" for every earlier statement in the document — and
 *     multi-statement documents are exactly the long ones, so this fault and a
 *     short query window compound onto the same units.
 *  4. STUB ONLY WHAT PROVABLY CANNOT CHANGE WHICH SPAN PRODUCED A VALUE —
 *     tempo, sample loading, hydra, UI sliders, and the editor-side visual taps
 *     (`_pianoroll`, `scope`, …), which draw the pattern and return it
 *     unchanged. Anything that could change a VALUE is not a stub, it is a
 *     divergence, and the measurement stops being about the real program.
 *  5. QUERY A WINDOW SIZED TO THE PERIOD (see `QUERY_CYCLES`). A unit with no
 *     haps is indistinguishable from a unit with no location.
 *
 * AND, spanning all five: REPORT THE COVERAGE REACHED. Every figure computed
 * from a sweep is over the documents that DID evaluate, and those may be
 * systematically simpler.
 *
 * ── COVERAGE, AND WHY IT DOES NOT GO TO 150 ───────────────────────────────
 * 142 of the 150 real tunes evaluate here (94.7%). The eight that do not were
 * each traced to a failing frame, and the classification matters more than the
 * count, because only one class is a bug we can fix:
 *
 *   5  document-intrinsic — two tunes are saved truncated mid-string, two call
 *      a control with two arguments (`note(0,.1)`), which makes the SECOND
 *      argument the pattern the control applies to, and one calls a function
 *      that exists nowhere. These fail identically in the live app.
 *   2  browser-bound — device motion sensors, and a bytebeat tune that needs a
 *      real `AudioContext`. Between them they hold 0 known-content units and 1
 *      unoffered unit, so stubbing them buys the measurement almost nothing
 *      while adding two divergences. Left alone deliberately.
 *   1  engine-version — uses `trigzeroJoin`, which is in no `@strudel` module
 *      we pin. Our own app cannot run this tune either.
 *   0  missing-scope. The category #1008 expected the bug in is empty.
 *
 * Six of the eight therefore cannot evaluate anywhere, which puts the honest
 * ceiling for this corpus at 144/150, not 150/150 — #1008's premise that every
 * residual document "evaluates fine in the live app" does not survive being
 * checked. We are at 142 of a reachable 144, and the two we are leaving are
 * priced above.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

let ready: Promise<any> | null = null

/**
 * Deliberate degradations, so every recovery mechanism in here can be proved
 * LOAD-BEARING by breaking it rather than by reading it. A coverage gate whose
 * only evidence is "the code looks right" is the gate this phase was filed to
 * replace.
 */
export interface EvalOptions {
  /** install the hydra globals for a document that calls `initHydra` (default true) */
  hydra?: boolean
  /** point `reify`'s string parser at mini — the DIVERGENCE, off by default */
  miniAllStrings?: boolean
}

/**
 * A callable that swallows every call and property access and returns itself.
 * Used for the hydra globals — see the stub block below for why that is
 * span-neutral. `then` must stay undefined or awaiting one of these hangs, and
 * symbol lookups must too or string coercion breaks.
 */
const chainableNoop: any = new Proxy(function () {} as any, {
  get: (_t, p) => (typeof p === 'symbol' || p === 'then' ? undefined : chainableNoop),
  apply: () => chainableNoop,
  construct: () => chainableNoop,
})

export async function boot() {
  if (ready) return ready
  ready = (async () => {
    const core: any = await import('@strudel/core')
    const mini: any = await import('@strudel/mini')
    const tonal: any = await import('@strudel/tonal')
    const xen: any = await import('@strudel/xen')
    // MIRROR THE ENGINE'S MODULE LIST (`StrudelEngine.ts:267-295`). The engine
    // registers webaudio/soundfonts/midi/mondo and deliberately EXCLUDES
    // `@strudel/draw` (it injects a full-screen canvas into document.body).
    // Registering a different set than the engine turns a setup gap into a
    // per-document "is not a function" that reads as a corpus property.
    //
    // Measured: mirroring the list changes coverage by ZERO documents. Not one
    // residual failure named a control these modules provide — so "we simply
    // did not register it", the category #1008 expected to find the bug in, is
    // EMPTY. It is kept anyway because a divergence that costs nothing today is
    // still a divergence, and the next dependency bump is what makes it cost.
    const optional: any[] = []
    const missingModules: string[] = []
    for (const [name, load] of [
      ['@strudel/webaudio', () => import('@strudel/webaudio')],
      ['@strudel/soundfonts', () => import('@strudel/soundfonts')],
      ['@strudel/midi', () => import('@strudel/midi')],
      ['@strudel/mondo', () => import('@strudel/mondo')],
    ] as const) {
      try {
        optional.push(await load())
      } catch (e: any) {
        // STATED DEVIATION, not a silent one. `@strudel/soundfonts` does not
        // load under this vitest config: it takes named exports from
        // `soundfont2`, which is CJS. Adding it to `server.deps.inline` does
        // not fix it. Coverage is identical with and without the module, and
        // sound selection happens at trigger time, never at eval, so it cannot
        // move a span — but the gap is reported rather than assumed harmless.
        missingModules.push(`${name}: ${String(e?.message ?? e).slice(0, 120)}`)
      }
    }
    await core.evalScope(core, mini, tonal, xen, ...optional)
    const { transpiler } = await import('@strudel/transpiler')

    // --- repl mirror (repl.mjs:171-268) ---------------------------------
    const state = { pPatterns: {} as Record<string, any>, allTransforms: [] as any[], eachTransform: null as any, anon: 0 }
    const Pattern = core.Pattern
    Pattern.prototype.p = function (id: any) {
      if (typeof id === 'string' && (id.startsWith('_') || id.endsWith('_'))) return core.silence
      if (String(id).includes('$')) { id = `${id}${state.anon}`; state.anon++ }
      state.pPatterns[id] = this
      return this
    }
    Pattern.prototype.q = function () { return core.silence }
    for (let i = 1; i < 10; i++) {
      Object.defineProperty(Pattern.prototype, `d${i}`, { get() { return this.p(i) }, configurable: true })
      Object.defineProperty(Pattern.prototype, `p${i}`, { get() { return this.p(i) }, configurable: true })
    }
    const g: any = globalThis
    g.all = (transform: any) => { state.allTransforms.push(transform); return core.silence }
    g.each = (transform: any) => { state.eachTransform = transform; return core.silence }
    // stubs that provably cannot change which span produced a value
    for (const name of ['setcps', 'setcpm', 'setCps', 'setCpm', 'setbpm', 'setBpm', 'initHydra', 'initBytebeat', 'initVideo', 'enableMotion', 'setVoicingRange', 'useRNG', 'setGainCurve', 'setmidimap', 'aliasBank', 'initAudio', 'setGain', 'setVolume', 'hush', 'render', 'src', 'dough']) {
      if (typeof g[name] !== 'function') g[name] = () => undefined
    }
    // draw.mjs:49 reads the scheduler clock when a pattern registers a painter.
    // A constant clock is span-neutral (it decides WHEN to draw, never which
    // span produced a value).
    core.setTime?.(() => 0)
    g.samples = async () => undefined
    g.slider = (v: any) => v
    g.sliderWithID = (_id: any, v: any) => v
    // (hydra globals are installed PER DOCUMENT — see `withHydra` below.)
    // Editor-side VISUAL taps. They exist in the live REPL (@strudel/codemirror),
    // draw the pattern and return it unchanged — provably span-neutral.
    for (const m of ['_pianoroll', '_punchcard', '_scope', '_spectrum', '_pitchwheel', '_spiral', 'scope', 'spectrum', 'markcss', 'pianoroll', 'punchcard', 'wordfall', 'spiral', 'pitchwheel', 'draw', 'onPaint']) {
      ;(Pattern.prototype as any)[m] = function (this: any) { return this }
    }
    if (!g.window) g.window = g

    return { core, transpiler, state, missingModules }
  })()
  return ready
}

export interface EvalResult {
  ok: boolean
  error?: string
  /** document-space spans the TRANSPILER declared */
  declared: Array<[number, number]>
  /** every location seen on a queried hap, deduped, in first-seen order */
  seen: Array<{ start: number; end: number }>
}

/**
 * HYDRA, installed per document rather than at boot.
 *
 * `initHydra()` builds a WebGL canvas and publishes these names onto `window`,
 * OVERWRITING the strudel globals they collide with — `shape`, `noise` and `a`
 * are strudel controls until hydra takes them. So the faithful mirror of the
 * live app is not "always stub" (that would change what `shape("…")` means for
 * the 143 documents that never call `initHydra`) and not "stub only the free
 * names" (that leaves a hydra chain calling strudel's `shape` with three
 * arguments): it is "install exactly when the document calls `initHydra`, and
 * restore afterwards".
 *
 * The stub is SPAN-NEUTRAL because a hydra call's return value never becomes a
 * Pattern. Verified over all 150 documents before this was written: every hydra
 * use is a standalone visual statement terminating in `.out(oN)` or
 * `render(oN)`, never a sub-expression of a pattern. A mini string handed to
 * hydra through `H("<4 5 6>")` is still transpiled and still declared in
 * `meta.miniLocations`; it simply never reaches a queried hap — which is also
 * what happens in the live app.
 */
const HYDRA_GLOBALS = [
  'osc', 'noise', 'voronoi', 'shape', 'gradient', 'solid', 'src', 'render', 'H', 'a',
  'o0', 'o1', 'o2', 'o3', 's0', 's1', 's2', 's3',
]

async function withHydra<T>(code: string, on: boolean, fn: () => Promise<T>): Promise<T> {
  const g: any = globalThis
  if (!on || !/\binitHydra\s*\(/.test(code)) return fn()
  const saved = HYDRA_GLOBALS.map((n) => [n, Object.prototype.hasOwnProperty.call(g, n), g[n]] as const)
  for (const n of HYDRA_GLOBALS) g[n] = chainableNoop
  try {
    return await fn()
  } finally {
    for (const [n, had, v] of saved) {
      if (had) g[n] = v
      else delete g[n]
    }
  }
}

/**
 * `miniAllStrings()` points `reify`'s string parser at mini, so EVERY string
 * reaching `reify` is mini-parsed — including single-quoted labels
 * (`.label('🍕')`) and single-quoted bytebeat source, which are not mini
 * notation and throw. `StrudelEngine` never calls it, so calling it here is a
 * DIVERGENCE that manufactures per-document failures: it cost one real document
 * in the corpus. Off by default; the option exists so the divergence can be
 * turned back on in a red-test and shown to break that document again.
 */
async function withStringParser<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  if (!on) return fn()
  const core: any = await import('@strudel/core')
  const mini: any = await import('@strudel/mini')
  mini.miniAllStrings()
  try {
    return await fn()
  } finally {
    core.setStringParser?.(undefined)
  }
}

/** Evaluate + query. `cycles` is the query WINDOW (see PV229 — scales with the period). */
export async function evalLocations(code: string, cycles = 128, opts: EvalOptions = {}): Promise<EvalResult> {
  return withStringParser(opts.miniAllStrings === true, () =>
    withHydra(code, opts.hydra !== false, () => evalLocationsInner(code, cycles)),
  )
}

async function evalLocationsInner(code: string, cycles: number): Promise<EvalResult> {
  const { core, transpiler, state } = await boot()
  state.pPatterns = {}
  state.allTransforms = []
  state.eachTransform = null
  state.anon = 0
  let pattern: any
  let meta: any
  try {
    const r = await core.evaluate(code, transpiler)
    pattern = r.pattern
    meta = r.meta
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e), declared: [], seen: [] }
  }
  try {
    // repl.mjs:238-250 — collect pPatterns, apply each, stack
    if (Object.keys(state.pPatterns).length) {
      let patterns: any[] = []
      let soloActive = false
      for (const [key, value] of Object.entries(state.pPatterns)) {
        const isSolod = key.length > 1 && key.startsWith('S')
        if (isSolod && !soloActive) { patterns = []; soloActive = true }
        if (!soloActive || isSolod) patterns.push(value)
      }
      if (state.eachTransform) patterns = patterns.map((x) => state.eachTransform(x))
      pattern = core.stack(...patterns)
    } else if (state.eachTransform) {
      pattern = state.eachTransform(pattern)
    }
    for (const t of state.allTransforms) pattern = t(pattern)
    if (!core.isPattern(pattern)) return { ok: false, error: 'not a pattern', declared: meta?.miniLocations ?? [], seen: [] }
  } catch (e: any) {
    return { ok: false, error: 'post: ' + String(e?.message ?? e), declared: meta?.miniLocations ?? [], seen: [] }
  }

  const seen: Array<{ start: number; end: number }> = []
  const key = new Set<string>()
  try {
    for (let c = 0; c < cycles; c++) {
      const haps = pattern.queryArc(c, c + 1)
      for (const h of haps) {
        for (const l of h.context?.locations ?? []) {
          const k = `${l.start}-${l.end}`
          if (!key.has(k)) { key.add(k); seen.push({ start: l.start, end: l.end }) }
        }
      }
    }
  } catch (e: any) {
    return { ok: false, error: 'query: ' + String(e?.message ?? e), declared: meta?.miniLocations ?? [], seen }
  }
  return { ok: true, declared: meta?.miniLocations ?? [], seen }
}

/** The 150 saved #986-P3 tunes (3 offsets × 50). */
export async function loadCorpus(): Promise<{ name: string; code: string }[]> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  // Resolved from THIS file, not from the cwd — the calibration runs from
  // @stave/app while the harness lives in @stave/editor.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.resolve(here, '../../../../../app/tests/parity-corpus/.bakery-runs')
  const files = [
    'edit-samples-2026-07-24T17-49-00-172Z.json',
    'edit-samples-offset250-2026-07-24T17-49-04-301Z.json',
    'edit-samples-offset500-2026-07-24T17-49-08-639Z.json',
  ]
  const out: { name: string; code: string }[] = []
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    for (const s of j.samples) out.push({ name: `${j.offset}/${s.hash}`, code: s.code })
  }
  return out
}
