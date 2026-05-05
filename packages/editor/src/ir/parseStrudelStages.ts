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
    const trimStart = code.search(/\S/)
    const start = trimStart >= 0 ? trimStart : 0
    return {
      tag: 'Code' as const,
      code: code.trim(),
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
    }
  }
  const trackCodes: PatternIR[] = tracks.map((t) => ({
    tag: 'Code' as const,
    code: t.expr,
    lang: 'strudel' as const,
    loc: [{ start: t.offset, end: t.offset + t.expr.length }],
  }))
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
    return parseRootWithChainMeta(input.code, input.loc?.[0]?.start ?? 0)
  }
  if (input.tag === 'Stack' && input.userMethod === undefined) {
    // Multi-track from RAW — apply parseRootWithChainMeta to each Code.
    const tracks = input.tracks.map((t) => {
      if (t.tag !== 'Code') return t // defensive
      return parseRootWithChainMeta(t.code, t.loc?.[0]?.start ?? 0)
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
    return IR.stack(...input.tracks.map(applyOnTrack))
  }
  // Single-track case (or any non-multi-track shape).
  return applyOnTrack(input)
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
 * Drop `unresolvedChain` + `chainOffset` from a node (shallow). Returns
 * a new object; original is untouched.
 */
function stripStageMeta(node: PatternIR): PatternIR {
  const n = node as Record<string, unknown>
  if (!('unresolvedChain' in n) && !('chainOffset' in n)) return node
  const { unresolvedChain: _u, chainOffset: _o, ...clean } = n
  void _u
  void _o
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
