/**
 * evalHarness — located haps OUTSIDE the browser, in the order that gets them
 * right. TEST SUPPORT ONLY: the live app evaluates through `StrudelEngine`,
 * which already has all of this; this exists so the resolver's calibration can
 * be measured over real documents in a headless run.
 *
 * Five steps, four of which fail SILENTLY when skipped — wrong numbers, never an
 * error. Each failure mode below has been hit at least once for real:
 *
 *  1. `evalScope` the WHOLE modules the live engine registers
 *     (`StrudelEngine.ts:295`), then `miniAllStrings()`. Passing `{ mini }`
 *     alone throws; passing too few modules produces a chain-method "is not a
 *     function" per tune, which reads as a corpus property rather than a setup
 *     bug.
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
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

let ready: Promise<any> | null = null

export async function boot() {
  if (ready) return ready
  ready = (async () => {
    const core: any = await import('@strudel/core')
    const mini: any = await import('@strudel/mini')
    const tonal: any = await import('@strudel/tonal')
    const xen: any = await import('@strudel/xen')
    const draw: any = await import('@strudel/draw')
    await core.evalScope(core, mini, tonal, xen, draw)
    mini.miniAllStrings()
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
    // Editor-side VISUAL taps. They exist in the live REPL (@strudel/codemirror),
    // draw the pattern and return it unchanged — provably span-neutral.
    for (const m of ['_pianoroll', '_punchcard', '_scope', '_spectrum', '_pitchwheel', '_spiral', 'scope', 'spectrum', 'markcss', 'pianoroll', 'punchcard', 'wordfall', 'spiral', 'pitchwheel', 'draw', 'onPaint']) {
      ;(Pattern.prototype as any)[m] = function (this: any) { return this }
    }
    if (!g.window) g.window = g

    return { core, transpiler, state }
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

/** Evaluate + query. `cycles` is the query WINDOW (see PV229 — scales with the period). */
export async function evalLocations(code: string, cycles = 128): Promise<EvalResult> {
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
