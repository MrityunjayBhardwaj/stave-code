/**
 * masterEdit — the MASTER strip's write decisions, as PURE functions.
 *
 * The master bus in Strudel is `all(x => …)`: it stacks every `$:`/named pattern
 * and applies the transform to the whole mix (`@strudel/core/repl.mjs:153`). So
 * the master strip's two round-tripped controls project to `all()` chains,
 * structurally identical to a channel line but scoped to the whole mix:
 *
 *   master fader   → all(x => x.gain(0.85))
 *   master pan     → all(x => x.pan(0.3))   (rides the gain line when present)
 *   master mute    → all(x => silence)      (a dedicated sentinel line)
 *   global backdrop→ all(x => x.viz("name", { backdrop: true }))
 *
 * By the SPLIT decision (design §9.4) gain and viz live on SEPARATE `all()`
 * lines — each edit function owns its own line, so they never coordinate on one
 * shared statement (`all()` transforms compose). The functions mirror
 * `writeStrip.ts`: pure `doc + value → StripEdit`, applied through the same
 * tagged `Writeback` seam every channel control uses (`MixerStrips.tsx`), so the
 * write-back is unit-testable without Monaco. The read path (code → live
 * backdrop / master gain) already ships in the engine — this is the write path.
 *
 * Robust to a hand-COMBINED chain: `masterGainEdit`/`masterVizEdit` bind to
 * whichever `all()` line already carries the relevant call, so a user who wrote
 * `all(x => x.gain(0.8).viz("a",{backdrop:true}))` still gets surgical edits;
 * only a fresh materialization uses the split convention.
 */
import { parseTopLevel, collectChain, type ChainArg, type ChainCall, type ChunkInfo } from '../chunkDetect'
import { formatNumber } from '../writeback'
import type { StripEdit } from './writeStrip'

/** unity gain — an untouched master reads unity from the ABSENCE of a line. */
export const MASTER_UNITY_GAIN = 1

/** centre pan — an untouched master reads centre (0.5) from the ABSENCE of a pan
 *  call, exactly as a channel strip does (grounded GR2). */
export const MASTER_CENTRE_PAN = 0.5

/**
 * A top-level `all(<arrow>)` statement we can read/edit — an expression-body
 * arrow (`all(x => x.chain())`). Block-body arrows / non-arrow `all(fast(…))`
 * are master transforms too but carry no editable gain/viz chain, so the
 * detector skips them (a fresh gain/viz line is materialized alongside instead).
 */
export interface MasterAll {
  /** the whole `all(...)` ExpressionStatement span */
  statementRange: [number, number]
  /** the statement's exact source when detected — freshness (mirrors ChunkInfo) */
  statementText: string
  /** the arrow body expression (`x.gain(…)`) — append `.fx()` here */
  arrowBodyRange: [number, number]
  /** the chain in the arrow body, in source order (via the shared `collectChain`) */
  chain: ChainCall[]
}

/** The arrow node of `all(<arrow with expression body>)`, or null. */
function matchAllArrow(node: any): { body: any } | null {
  if (!node || node.type !== 'ExpressionStatement') return null
  const expr = node.expression
  if (
    !expr ||
    expr.type !== 'CallExpression' ||
    expr.callee.type !== 'Identifier' ||
    expr.callee.name !== 'all' ||
    expr.arguments.length < 1
  ) {
    return null
  }
  const arrow = expr.arguments[0]
  if (!arrow || arrow.type !== 'ArrowFunctionExpression') return null
  // Only expression-body arrows (`x => x.gain()`); a block body (`x => { … }`)
  // has no single chain expression to read.
  if (arrow.body.type === 'BlockStatement') return null
  return { body: arrow.body }
}

/** Every editable master `all(x => …)` statement, in source order. Pure. */
export function detectMasterAll(doc: string): MasterAll[] {
  const statements = parseTopLevel(doc)
  if (!statements) return []
  const out: MasterAll[] = []
  for (const node of statements) {
    const arrow = matchAllArrow(node)
    if (!arrow) continue
    const headOut = { ref: null as any }
    const chain = collectChain(doc, arrow.body, headOut)
    out.push({
      statementRange: [node.start, node.end],
      statementText: doc.slice(node.start, node.end),
      arrowBodyRange: [arrow.body.start, arrow.body.end],
      chain,
    })
  }
  return out
}

function findGainCall(m: MasterAll): ChainCall | undefined {
  return m.chain.find((c) => c.name === 'gain')
}

function findPanCall(m: MasterAll): ChainCall | undefined {
  return m.chain.find((c) => c.name === 'pan' && c.args.length >= 1)
}

/** The arrow body's source text, trimmed — used to spot the mute sentinel line
 *  `all(x => silence)`, whose body is the bare identifier `silence` (empty chain). */
function arrowBodyText(doc: string, m: MasterAll): string {
  return doc.slice(m.arrowBodyRange[0], m.arrowBodyRange[1]).trim()
}

/** The master mute line — a top-level `all(x => silence)` (any arrow param name).
 *  This is the master analog of a channel's `_`-prefix: it collapses the whole
 *  stacked mix to `silence` (`@strudel/core/repl.mjs:262` applies the transform
 *  to the stacked pattern; `silence` is `gap(1)`, the empty pattern). Detected by
 *  the arrow BODY being exactly `silence` (an empty chain), so it never collides
 *  with a gain/pan line — `readMasterGain`/`readMasterPan` skip it (no such call). */
function findMuteLine(doc: string): MasterAll | undefined {
  return detectMasterAll(doc).find((m) => arrowBodyText(doc, m) === 'silence')
}

/** A backdrop-viz call: `.viz(<name>, { backdrop: true })`. The flag is what
 *  distinguishes a MASTER backdrop from a channel-scoped inline `.viz("name")`
 *  (design §4). Matched on the arg source (spacing-tolerant) — the object arg is
 *  raw text at this layer, and WE always emit the canonical `{ backdrop: true }`. */
function findVizBackdropCall(m: MasterAll): ChainCall | undefined {
  return m.chain.find(
    (c) => c.name === 'viz' && c.args.some((a) => /\bbackdrop\s*:\s*true\b/.test(a.raw)),
  )
}

/** The first string-literal arg of a call (the viz name), or undefined. Its
 *  `range` spans the quotes, so replacing it swaps the whole literal. */
function vizNameArg(c: ChainCall): ChainArg | undefined {
  return c.args.find((a) => /^['"`]/.test(a.raw))
}

/** the master gain the fader shows: the `all()` gain scalar, or unity when
 *  absent. `foreign` = a gain call whose arg is a signal/pattern (not a number),
 *  so the fader can't rewrite it and should disable (mirrors the channel fader). */
export interface MasterGainState {
  value: number
  foreign: boolean
}

export function readMasterGain(doc: string): MasterGainState {
  for (const m of detectMasterAll(doc)) {
    const g = findGainCall(m)
    if (!g) continue
    const arg = g.args[0]
    if (!arg) return { value: MASTER_UNITY_GAIN, foreign: true } // `.gain()` empty — can't drive
    if (arg.numeric === null) return { value: MASTER_UNITY_GAIN, foreign: true } // signal gain
    return { value: arg.numeric, foreign: false }
  }
  return { value: MASTER_UNITY_GAIN, foreign: false }
}

/** the master pan the pan control shows: the `all()` pan scalar, or centre (0.5)
 *  when absent. `foreign` = a pan call whose arg is a signal/pattern (not a
 *  number), so the control can't rewrite it and disables (mirrors the channel). */
export interface MasterPanState {
  value: number
  foreign: boolean
}

export function readMasterPan(doc: string): MasterPanState {
  for (const m of detectMasterAll(doc)) {
    const p = findPanCall(m)
    if (!p) continue
    const arg = p.args[0]
    if (arg.numeric === null) return { value: MASTER_CENTRE_PAN, foreign: true } // signal pan
    return { value: arg.numeric, foreign: false }
  }
  return { value: MASTER_CENTRE_PAN, foreign: false }
}

/** whether the master is muted — a top-level `all(x => silence)` line is present.
 *  Orthogonal to gain (V-mixer-2): mute never touches `.gain`, only this sentinel
 *  line, so unmute is the exact inverse and the fader value survives untouched. */
export function readMasterMute(doc: string): boolean {
  return findMuteLine(doc) !== undefined
}

/**
 * The master "audio" `all()` line — the one the EXPAND DRAWER binds its insert
 * chain to. It is the first expression-body `all(x => …)` that is NOT the mute
 * sentinel (`x => silence`) and NOT a pure backdrop-viz line (presentation, not
 * audio). Gain/pan/effect inserts all live here (pan rides the gain line), so the
 * drawer's effects chain and the fader/pan controls act on ONE statement.
 */
export function detectMasterAudioAll(doc: string): MasterAll | undefined {
  return detectMasterAll(doc).find((m) => {
    if (arrowBodyText(doc, m) === 'silence') return false // the mute sentinel line
    // a line carrying ONLY backdrop-viz calls is presentation, not an audio chain
    if (m.chain.length >= 1 && m.chain.every((c) => c.name === 'viz')) return false
    return true
  })
}

/**
 * Adapt a master `all(x => …)` line to a `ChunkInfo` so the shared `MixerBody` /
 * `ExpandDrawer` can render + edit its insert chain exactly as for a channel.
 *
 * A channel's `chain[0]` is its HEAD call (`s("bd")`); the master arrow's base is
 * the bare param `x` (an identifier, not a call), so `collectChain` yields a chain
 * with NO head. We prepend a SYNTHETIC head at index 0 so the body's index math
 * matches a channel: `MixerBody` skips index 0 for effect add/remove (`i > 0`, so
 * it never deletes the base), and `knobsFromChunk` ignores it (no numeric args).
 * `exprRange` is the arrow body, so a new `.fx()` appends at the chain's end
 * (`x.gain(1)` → `x.gain(1).room(0.4)`). Gain/pan carry knobs only when surfaced
 * (they're strip-owned — the fader/pan row), so the drawer shows the INSERTS.
 */
export function adaptMasterChunk(doc: string, m: MasterAll): ChunkInfo {
  const head: ChainCall = {
    name: 'x', // the arrow param — inert: index 0 is never edited by MixerBody
    args: [],
    range: [m.arrowBodyRange[0], m.arrowBodyRange[0]],
  }
  return {
    statementRange: m.statementRange,
    statementText: m.statementText,
    exprRange: m.arrowBodyRange,
    label: null,
    headFn: null,
    miniRange: null,
    miniString: null,
    miniVia: null,
    miniAnchor: null,
    chain: [head, ...m.chain],
    type: 'knobs',
    nested: false,
  }
}

/** the master backdrop the "set backdrop" UI shows: the `all()` backdrop-viz
 *  name, or null when no master backdrop is declared in code. */
export function readMasterViz(doc: string): { name: string } | null {
  for (const m of detectMasterAll(doc)) {
    const v = findVizBackdropCall(m)
    if (!v) continue
    const nameArg = vizNameArg(v)
    if (!nameArg) continue
    return { name: nameArg.raw.slice(1, -1) }
  }
  return null
}

/**
 * The edit the master fader makes for `value` (a linear gain, decision 1 =
 * REPLACE):
 *  - present scalar → replace the literal in the existing `all()` gain call;
 *  - absent         → insert a fresh `all(x => x.gain(value))` line (decision 4 =
 *                     write the literal, incl. `.gain(1)` at unity, matching the
 *                     channel `gainEdit`);
 *  - foreign        → null (a signal/empty gain — the fader is disabled).
 */
export function masterGainEdit(doc: string, value: number): StripEdit | null {
  for (const m of detectMasterAll(doc)) {
    const g = findGainCall(m)
    if (!g) continue
    const arg = g.args[0]
    if (!arg || arg.numeric === null) return null // foreign/empty — disabled
    return { range: arg.range, text: formatNumber(value) }
  }
  return insertStatement(doc, `all(x => x.gain(${formatNumber(value)}))`)
}

/**
 * The edit the master pan control makes for `value` (0..1, 0.5 = centre), mirror
 * of the channel `panEdit` but scoped to the master bus:
 *  - present scalar → replace the literal in the existing `all()` pan call;
 *  - foreign        → null (a signal/pattern pan — the control is disabled);
 *  - absent         → append `.pan(value)` to the gain-bearing `all()` line if one
 *                     exists (channel-parity output `all(x => x.gain(1).pan(v))`),
 *                     else materialize its own `all(x => x.pan(value))` line.
 *
 * Appending to the gain line keeps the common case (fader dragged, then pan) on
 * ONE audio `all()` chain, exactly like a channel. The rarer pan-first order
 * yields its own line and a later gain drag adds a second — both compose (`all()`
 * transforms stack); the split is harmless, only slightly less tidy.
 */
export function masterPanEdit(doc: string, value: number): StripEdit | null {
  for (const m of detectMasterAll(doc)) {
    const p = findPanCall(m)
    if (!p) continue
    const arg = p.args[0]
    if (arg.numeric === null) return null // signal pan — disabled
    return { range: arg.range, text: formatNumber(value) }
  }
  // No pan call yet: ride the audio (gain) line so gain+pan share one chain.
  for (const m of detectMasterAll(doc)) {
    if (findGainCall(m)) {
      return { range: [m.arrowBodyRange[1], m.arrowBodyRange[1]], text: `.pan(${formatNumber(value)})` }
    }
  }
  return insertStatement(doc, `all(x => x.pan(${formatNumber(value)}))`)
}

/**
 * The edit a master mute toggle makes — add/remove the `all(x => silence)` line
 * (design: the master analog of a channel's `_`-prefix). Mute is ORTHOGONAL to
 * gain (V-mixer-2, P194): it never touches `.gain`, only this dedicated sentinel
 * line, so unmute is the exact inverse and the fader value round-trips untouched.
 *  - mute (true)  → insert `all(x => silence)` (no-op/null if already muted);
 *  - unmute (false)→ remove the whole `all(x => silence)` line (null if not muted).
 */
export function masterMuteEdit(doc: string, muted: boolean): StripEdit | null {
  const line = findMuteLine(doc)
  if (muted) return line ? null : insertStatement(doc, 'all(x => silence)')
  return line ? removeStatement(doc, line.statementRange) : null
}

/**
 * The edit the "set backdrop" UI makes (decision 2 = code is the single source):
 *  - set `name`  → replace the name literal in the existing master backdrop viz,
 *                  or insert a fresh `all(x => x.viz("name", { backdrop: true }))`
 *                  line;
 *  - clear (null)→ remove the master backdrop viz: the whole `all()` statement
 *                  when it holds nothing else, else just the `.viz(...)` call
 *                  (so a hand-combined `gain().viz()` keeps its gain).
 *
 * Returns null when clearing with no master backdrop present (nothing to do), or
 * when an existing backdrop viz has no string name to rewrite.
 */
export function masterVizEdit(doc: string, name: string | null): StripEdit | null {
  for (const m of detectMasterAll(doc)) {
    const v = findVizBackdropCall(m)
    if (!v) continue
    if (name === null) {
      // clear — drop the whole line if the viz is all it carries, else surgical
      if (m.chain.length === 1) return removeStatement(doc, m.statementRange)
      return { range: v.range, text: '' }
    }
    const nameArg = vizNameArg(v)
    if (!nameArg) return null // backdrop viz with no string name — nothing safe to patch
    return { range: nameArg.range, text: JSON.stringify(name) }
  }
  if (name === null) return null // nothing to clear
  return insertStatement(doc, `all(x => x.viz(${JSON.stringify(name)}, { backdrop: true }))`)
}

/** Append `statement` as the document's last line. Adds a single leading
 *  newline unless the doc is empty or already ends in one — never a materialize
 *  on render, only on a deliberate control gesture (design §7). */
function insertStatement(doc: string, statement: string): StripEdit {
  const pos = doc.length
  const lead = doc.length === 0 || doc.endsWith('\n') ? '' : '\n'
  return { range: [pos, pos], text: `${lead}${statement}` }
}

/** Remove a whole statement AND its own line (the preceding newline + any
 *  indentation, or the trailing newline for a first line) so clearing leaves no
 *  blank line behind. */
function removeStatement(doc: string, stmt: [number, number]): StripEdit {
  let start = stmt[0]
  let end = stmt[1]
  const prevNL = doc.lastIndexOf('\n', start - 1)
  if (prevNL >= 0 && doc.slice(prevNL + 1, start).trim() === '') {
    start = prevNL // consume the newline + indentation before the statement
  } else if (doc[end] === '\n') {
    end = end + 1 // first line — consume the trailing newline instead
  }
  return { range: [start, end], text: '' }
}
