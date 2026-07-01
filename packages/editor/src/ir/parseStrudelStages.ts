/**
 * parseStrudel — staged pipeline.
 *
 * Surfaces the 4 internal stages of parseStrudel as named passes so
 * the IR Inspector can render each as a tab. End-to-end behavior at
 * FINAL is byte-identical to parseStrudel(code) (D-06 regression gate).
 *
 * Stage boundaries (CONTEXT D-02):
 *   RAW            — extractTracks: per-track Code lifts + offsets
 *   MINI-EXPANDED  — parseRoot per track; chains held as metadata
 *   CHAIN-APPLIED  — applyChain runs per track; metadata dropped
 *   FINAL          — identity today; reserved for future polish
 *
 * Pass<IR> contract: each stage runs PatternIR → PatternIR.
 * Seed input: callers wrap raw source `code: string` in IR.code(code)
 * before pass 0. Pass 0 (RAW) reads input.tag === 'Code' && input.code.
 *
 * Phase 19-07 (#79).
 */

import { IR, type PatternIR } from './PatternIR'
import {
  extractTracks,
  parseRoot,
  applyChain,
  splitRootAndChain,
  stripParserPrelude,
} from './parseStrudel'

/**
 * RAW — per-track Code lifts.
 *
 * 0 tracks → single Code node carrying `code.trim()` text + loc spanning
 *            from first non-WS char to end of source.
 * 1 track  → single Code node carrying that track's `expr` text + loc
 *            from extractTracks.
 * ≥2 tracks → outer Stack of per-track Code lifts; userMethod undefined
 *             (synthetic from RAW; projects to mini polymetric `{}` per
 *             RESEARCH §6 D-04 risk acceptance).
 *
 * PV25: every Code lift threads extractTracks's existing offset into its
 * loc.start; loc.end = offset + expr.length.
 */
export function runRawStage(input: PatternIR): PatternIR {
  // Pre-pass-0 seed: input is IR.code(rawSource).
  if (input.tag !== 'Code') {
    // Defensive: passed something other than Code. Pass-through.
    return input
  }
  const code = input.code
  if (!code.trim()) {
    // Empty source — single empty Code node. Mirrors parseStrudel's
    // `if (!code.trim()) return IR.pure()` guard but as a Code lift so
    // the RAW tab still shows something structured.
    return {
      tag: 'Code' as const,
      code: '',
      lang: 'strudel' as const,
      loc: [{ start: 0, end: code.length }],
    }
  }
  const tracks = extractTracks(code)
  if (tracks.length === 0) {
    // Phase 20-14 parser-gap PARITY (#113) — strip the leading prelude
    // (whole-line comments, blank lines, recognised boot side-effects like
    // `setcps(…)` / `samples(…)`) before lifting, exactly as parseStrudel's
    // no-`$:` branch does (parseStrudel.ts:804). Without this, a bare pattern
    // PRECEDED by a prelude statement (`setcps(120/240)\ns("bd hh sd")`) lifted
    // the WHOLE source as one Code node → MINI-EXPANDED read `setcps(…)` as the
    // root and the pattern fell through to opaque Code → zero events → an empty
    // timeline. parseStrudel got this fix in 20-14; the STAGED pipeline (the
    // snapshot/timeline path via runPasses) had diverged and still lifted the
    // raw source. A lone bare pattern (no prelude) is unaffected — strip is a
    // no-op there.
    const stripped = stripParserPrelude(code)
    if (!stripped.body.trim()) {
      // Source is ENTIRELY prelude (no musical body) — empty Code lift.
      // MINI-EXPANDED maps an empty Code → IR.pure(), preserving the
      // synthetic-d1 shape downstream (mirrors parseStrudel.ts:805-810).
      return {
        tag: 'Code' as const,
        code: '',
        lang: 'strudel' as const,
        loc: [{ start: stripped.offset, end: code.length }],
      }
    }
    const bodyTrimStart = stripped.body.search(/\S/)
    const start = stripped.offset + (bodyTrimStart >= 0 ? bodyTrimStart : 0)
    return {
      tag: 'Code' as const,
      code: stripped.body.trim(),
      lang: 'strudel' as const,
      loc: [{ start, end: code.length }],
    }
  }
  if (tracks.length === 1) {
    const t = tracks[0]
    return {
      tag: 'Code' as const,
      code: t.expr,
      lang: 'strudel' as const,
      loc: [{ start: t.offset, end: t.offset + t.expr.length }],
      // #671 — a lone `name: …` / `$:` track threads its label AND its
      // `$:`-line range so CHAIN-APPLIED's single-track wrap mirrors
      // parseStrudel.ts:857 exactly: `trackId = label` (not synthetic `d1`)
      // AND `loc = [{ dollarStart, end }]`. A lone `$:` carries label === '$'
      // → d1 (unchanged); a bare pattern (tracks.length === 0) never reaches
      // here so it stays loc-free, matching parseStrudel's no-`$:` branch.
      trackLabel: t.label,
      dollarStart: t.dollarStart,
      dollarEnd: t.end,
    } as PatternIR
  }
  const trackCodes: PatternIR[] = tracks.map((t) => ({
    tag: 'Code' as const,
    code: t.expr,
    lang: 'strudel' as const,
    loc: [{ start: t.offset, end: t.offset + t.expr.length }],
    // Phase 20-11 α-4 — stage-transition metadata. Stash the `$:` line
    // range (dollarStart..end-of-track-body-slice) so runChainAppliedStage
    // can construct the Track wrapper with the same loc parseStrudel main
    // produces (line 0..15 for the first $:, 15..28 for the second, etc.).
    // Additive narrow-union per D-03; mirrors `unresolvedChain` /
    // `chainOffset` (PR-A precedent). Stripped from FINAL by stripStageMeta
    // — the strip happens in applyOnTrack via stripStageMeta below + in
    // the test-helper stripStageMeta the regression sentinel uses.
    dollarStart: t.dollarStart,
    dollarEnd: t.end,
    // #671 — thread the `name:` label so CHAIN-APPLIED builds the Track
    // wrapper with `trackId = label` (parseStrudel.ts:876), not a `d{N}`
    // ordinal. Without this the full-song timeline (which consumes THIS
    // staged pipeline, not monolithic parseStrudel) dropped labelled-track
    // names → `d1/d2/d3`. `$:` carries label === '$' → d{N} unchanged.
    trackLabel: t.label,
  } as PatternIR))
  return {
    tag: 'Stack' as const,
    tracks: trackCodes,
    loc: [{ start: 0, end: code.length }],
    // userMethod intentionally undefined — synthetic-from-RAW outer
    // wrapper. Projects to mini polymetric `{}` symbol per 19-06.
  }
}

/**
 * MINI-EXPANDED — parseRoot per track; chains held as metadata.
 *
 * Reads RAW's Code lifts (0/1-track single Code, or multi-track Stack
 * of Codes); produces parsed root IR per track with `unresolvedChain`
 * + `chainOffset` metadata stashed on each root for CHAIN-APPLIED to
 * consume.
 *
 * PV31 hot spot: root-level `stack(...)` literal-construction sets
 * userMethod === 'stack' inside parseRoot. We delegate to parseRoot
 * directly so this is preserved by construction.
 */
export function runMiniExpandedStage(input: PatternIR): PatternIR {
  if (input.tag === 'Code') {
    // 0-track or 1-track from RAW. Empty Code (empty source from RAW)
    // → IR.pure() to mirror parseStrudel's empty-source behavior.
    if (!input.code.trim()) return IR.pure()
    const parsed = parseRootWithChainMeta(input.code, input.loc?.[0]?.start ?? 0)
    // #671 — carry a lone track's `name:`/`$:` label AND `$:`-line range
    // through to CHAIN-APPLIED (mirrors the multi-track threading below).
    const cMeta = input as unknown as { trackLabel?: string; dollarStart?: number; dollarEnd?: number }
    if (cMeta.trackLabel !== undefined) {
      return {
        ...(parsed as object),
        trackLabel: cMeta.trackLabel,
        ...(cMeta.dollarStart !== undefined && cMeta.dollarEnd !== undefined
          ? { dollarStart: cMeta.dollarStart, dollarEnd: cMeta.dollarEnd }
          : {}),
      } as unknown as PatternIR
    }
    return parsed
  }
  if (input.tag === 'Stack' && input.userMethod === undefined) {
    // Multi-track from RAW — apply parseRootWithChainMeta to each Code.
    // Phase 20-11 α-4: thread the dollarStart/dollarEnd stage-meta from
    // RAW through to the parsed root so CHAIN-APPLIED can construct the
    // Track wrapper with the correct loc.
    const tracks = input.tracks.map((t) => {
      if (t.tag !== 'Code') return t // defensive
      const parsed = parseRootWithChainMeta(t.code, t.loc?.[0]?.start ?? 0)
      const tMeta = t as unknown as { dollarStart?: number; dollarEnd?: number; trackLabel?: string }
      if (tMeta.dollarStart !== undefined && tMeta.dollarEnd !== undefined) {
        return {
          ...(parsed as object),
          dollarStart: tMeta.dollarStart,
          dollarEnd: tMeta.dollarEnd,
          // #671 — thread the label alongside the loc stage-meta.
          ...(tMeta.trackLabel !== undefined ? { trackLabel: tMeta.trackLabel } : {}),
        } as unknown as PatternIR
      }
      return parsed
    })
    return { ...input, tracks }
  }
  // Defensive pass-through.
  return input
}

/**
 * Single-track helper — runs parseRoot + stashes unresolvedChain
 * metadata on the resulting root. Mirrors parseExpression's logic
 * (parseStrudel.ts:126-160) but stops after parseRoot, holding the
 * chain string + offset as metadata for CHAIN-APPLIED to consume.
 *
 * Empty/whitespace expr → IR.pure() (mirrors parseExpression's guard).
 *
 * If parseRoot falls back to Code (whole expression is opaque), we
 * mirror parseExpression's branch: when chain is non-empty, return
 * Code(expr) with no chain stash; when chain is empty, return Code(expr).
 * Both branches preserve PR-A regression sentinel (T-05.c byte-equal vs
 * parseStrudel).
 */
function parseRootWithChainMeta(expr: string, baseOffset: number): PatternIR {
  if (!expr.trim()) return IR.pure()
  const leadingWs = expr.length - expr.trimStart().length
  const trimmedOffset = baseOffset + leadingWs
  const trimmed = expr.trim()
  const { root, chain } = splitRootAndChain(trimmed)
  const rootIR = parseRoot(root, trimmedOffset)

  // Mirror parseExpression's Code-fallback branches (parseStrudel.ts:140-146):
  // when parseRoot couldn't parse the root, the entire expression is opaque
  // — return Code(expr) (no chain stash). This guarantees PR-A regression
  // sentinel byte-equality vs today's parseStrudel for opaque inputs.
  if (rootIR.tag === 'Code') {
    return IR.code(expr)
  }

  if (chain.trim()) {
    const chainOffset = trimmedOffset + root.length
    // Narrow-union metadata stash (D-03; RESEARCH §3.1 fallback).
    return {
      ...rootIR,
      unresolvedChain: chain,
      chainOffset,
    } as PatternIR
  }
  return rootIR
}

/**
 * CHAIN-APPLIED — reads `unresolvedChain` + `chainOffset` metadata from
 * each track root; calls applyChain with the chainOffset as baseOffset
 * (PK12 dot-inclusive convention preserved); drops metadata from output.
 *
 * Per RESEARCH §6 D-05 alternative: PR-A ships the REAL implementation
 * here (not a no-op stub), tested as identity-equivalent-to-today's-
 * parseStrudel-output via T-05.c regression sentinel. PR-B's split is
 * about splitting FINAL out as a polish stage, not about replacing this
 * logic.
 *
 * D-06.c: output has NO orphan unresolvedChain/chainOffset on any node.
 */
export function runChainAppliedStage(input: PatternIR): PatternIR {
  if (input.tag === 'Stack' && input.userMethod === undefined) {
    // Multi-track from MINI-EXPANDED — applyChain per track, then
    // rebuild the outer Stack via IR.stack so the FINAL shape matches
    // today's parseStrudel (`IR.stack(...tracks.map(parseExpression))`
    // at parseStrudel.ts:66) which produces `{ tag: 'Stack', tracks }`
    // with NO outer loc/userMethod. RAW's synthetic outer loc is
    // intentionally dropped here — it was only useful at the RAW tab
    // for visualizing the source span, NOT a real source-correspondence
    // for the multi-track Stack node. T-05.c regression sentinel
    // enforces byte-equality.
    //
    // Phase 20-11 α-4 — wrap each track with Track(`d${i+1}`, applied,
    // {loc: dollarStart..dollarEnd}) so the pipeline FINAL output mirrors
    // parseStrudel main path (line 110-115). dollarStart / dollarEnd were
    // threaded from RAW → MINI-EXPANDED → here as stage-meta; consume +
    // strip in applyOnTrack so the inner Track body is metadata-clean.
    return IR.stack(
      ...input.tracks.map((t, i) => {
        const tMeta = t as unknown as { dollarStart?: number; dollarEnd?: number; trackLabel?: string }
        const applied = applyOnTrack(t)
        const meta =
          tMeta.dollarStart !== undefined && tMeta.dollarEnd !== undefined
            ? { loc: [{ start: tMeta.dollarStart, end: tMeta.dollarEnd }] }
            : undefined
        // #671 — a real `name:` label becomes the trackId (mirrors
        // parseStrudel.ts:876); `$:` (label === '$') keeps the synthetic
        // `d{i+1}` so existing multi-`$:` tunes stay byte-identical.
        const trackId =
          tMeta.trackLabel && tMeta.trackLabel !== '$' ? tMeta.trackLabel : `d${i + 1}`
        return IR.track(trackId, applied, meta)
      }),
    )
  }
  // Single-track case (or any non-multi-track shape). Phase 20-11 γ-4 —
  // wrap with synthetic Track('d1', applied) to mirror parseStrudel main
  // path. NO loc and NO userMethod (synthetic-from-non-`$:`); toStrudel's
  // β-2 Track arm strips the wrap on round-trip when userMethod undefined
  // so byte identity holds. The test migration uses the unwrapD1 helper
  // (`__tests__/helpers/unwrapD1.ts`) to drill through this wrap.
  // #671 — a lone `name:` track carries its label → trackId AND its `$:`-line
  // loc (mirrors parseStrudel.ts:857); a lone `$:` (label === '$') keeps the
  // synthetic `d1` but still gets the loc; a bare pattern (no meta) stays
  // `d1` with NO loc, matching parseStrudel's no-`$:` branch.
  const sMeta = input as unknown as { trackLabel?: string; dollarStart?: number; dollarEnd?: number }
  const singleTrackId =
    sMeta.trackLabel && sMeta.trackLabel !== '$' ? sMeta.trackLabel : 'd1'
  const singleMeta =
    sMeta.dollarStart !== undefined && sMeta.dollarEnd !== undefined
      ? { loc: [{ start: sMeta.dollarStart, end: sMeta.dollarEnd }] }
      : undefined
  return IR.track(singleTrackId, applyOnTrack(input), singleMeta)
}

/**
 * Apply chain (if any) to a single track's root; strip stage-transition
 * metadata. Returns a clean PatternIR with no unresolvedChain/chainOffset.
 */
function applyOnTrack(node: PatternIR): PatternIR {
  const m = node as { unresolvedChain?: string; chainOffset?: number }
  if (m.unresolvedChain === undefined) {
    // No chain to apply — but the metadata fields may still exist as
    // `undefined` after a `{ ...rootIR, unresolvedChain: x }` spread that
    // didn't fire. Strip defensively.
    return stripStageMeta(node)
  }
  const chain = m.unresolvedChain
  const chainOffset = m.chainOffset ?? 0
  // Strip stage-transition metadata BEFORE feeding to applyChain so
  // applyChain's output is metadata-free by construction.
  const clean = stripStageMeta(node)
  if (chain.trim()) {
    return applyChain(clean, chain, chainOffset)
  }
  return clean
}

/**
 * Drop stage-transition metadata from a node (shallow). Returns a new
 * object; original is untouched. Strips:
 *   - `unresolvedChain` / `chainOffset` (PR-A precedent — 19-07)
 *   - `dollarStart` / `dollarEnd` (Phase 20-11 α-4 — Track-loc threading)
 */
function stripStageMeta(node: PatternIR): PatternIR {
  const n = node as Record<string, unknown>
  if (
    !('unresolvedChain' in n) &&
    !('chainOffset' in n) &&
    !('dollarStart' in n) &&
    !('dollarEnd' in n) &&
    !('trackLabel' in n)
  ) {
    return node
  }
  const {
    unresolvedChain: _u,
    chainOffset: _o,
    dollarStart: _ds,
    dollarEnd: _de,
    // #671 — the label is CONSUMED as trackId in CHAIN-APPLIED; strip the
    // meta so it never leaks onto a FINAL node body (keeps byte-equality).
    trackLabel: _tl,
    ...clean
  } = n
  void _u
  void _o
  void _ds
  void _de
  void _tl
  return clean as PatternIR
}

/**
 * FINAL — identity today; reserved for future normalization passes
 * (per CONTEXT scope). Keeps the name `'Parsed'` at the STRUDEL_PASSES
 * call site for tab-persistence backward-compat (RESEARCH §3.2).
 */
export function runFinalStage(input: PatternIR): PatternIR {
  return input
}
