/**
 * usePatternLength — what the grid's `+` handle offers, decided before it is
 * pressed (#1824).
 *
 * Both rewrites (`notation/lengthen.ts`) are asked of Strudel and then of this
 * panel's own parser when the handle is reached, so it can say "not here,
 * because…" on hover instead of failing after the click.
 */
import * as React from 'react'

import { emitLog } from '../../engine/engineLog'
import type { ChunkInfo } from '../chunkDetect'
import { appendEmptyBars, repeatBars, type LengthenResult } from '../notation/lengthen'
import type { ParseResult } from '../notation/model'
import { UNREFINED, type ViewScale } from '../notation/viewResolution'

/**
 * A per-column `.gain("…")` is managed only while each bar is one column, so a
 * longer melody would silently lock its velocity lane. Refused until that lane can
 * follow a multi-bar pattern.
 */
const VELOCITY_STRING =
  "its velocities are written per column, and the velocity lane can't follow a longer pattern yet"

const GRID_CANT_SHOW = "the grid couldn't show the longer pattern"

function hasVelocityString(chunk: ChunkInfo): boolean {
  const arg = chunk.chain.find((c) => c.name === 'gain')?.args[0]
  return !!arg && /^["'`]/.test(arg.raw)
}

export interface Verdict {
  /** click: repeat the pattern once — or why not */
  repeat: LengthenResult
  /** drag: can empty bars be appended at all — or why not */
  append: LengthenResult
}

export interface PatternLength {
  /** bars the grid draws the pattern over */
  bars: number
  /**
   * What the handle offers right now, or null with no pattern. Asked ON DEMAND —
   * when the pointer or focus reaches the handle — and cached per pattern, because
   * it queries Strudel: ~20ms on a 12-bar, 16-step pattern (measured), which paid on
   * every edit would land on every frame of an unrelated note drag.
   */
  verdict: () => Verdict | null
  onRepeat: () => void
  onAddBars: (n: number) => void
}

export function usePatternLength<M extends { bars?: number }>(
  chunk: ChunkInfo | null,
  model: M | null,
  parse: (mini: string, viewScale: ViewScale) => ParseResult<M>,
  writeMini: (mini: string) => void,
): PatternLength {
  const mini = model ? (chunk?.miniString ?? null) : null
  const bars = model?.bars ?? 1
  const velocity = chunk ? hasVelocityString(chunk) : false
  const parseRef = React.useRef(parse)
  parseRef.current = parse

  // The last gate is the grid itself: a rewrite Strudel plays correctly but this
  // panel would open at a different length — or not at all — is refused, or the
  // click would send the panel to standby.
  const check = (r: LengthenResult, wantBars: number): LengthenResult => {
    if (!r.ok) return r
    if (velocity) return { ok: false, reason: VELOCITY_STRING }
    const read = parseRef.current(r.mini, UNREFINED)
    return read.ok && (read.model.bars ?? 1) === wantBars ? r : { ok: false, reason: GRID_CANT_SHOW }
  }

  const cache = React.useRef<{ key: string; verdict: Verdict } | null>(null)
  const verdict = (): Verdict | null => {
    if (mini === null) return null
    const key = `${bars}|${velocity}|${mini}`
    if (cache.current?.key !== key) {
      cache.current = {
        key,
        verdict: {
          repeat: check(repeatBars(mini, bars), 2 * bars),
          append: check(appendEmptyBars(mini, bars, 1), bars + 1),
        },
      }
    }
    return cache.current.verdict
  }

  const onRepeat = (): void => {
    const r = verdict()?.repeat
    if (!r) return
    if (r.ok) writeMini(r.mini)
    else report("Couldn't repeat the pattern", r.reason)
  }
  const onAddBars = (n: number): void => {
    if (mini === null || n < 1) return
    const r = check(appendEmptyBars(mini, bars, n), bars + n)
    if (r.ok) writeMini(r.mini)
    else report(`Couldn't add ${n === 1 ? 'a bar' : `${n} bars`}`, r.reason)
  }
  return { bars, verdict, onRepeat, onAddBars }
}

/** Said in the Console, as the grids' other refusals are; the document is untouched. */
function report(attempted: string, reason: string): void {
  emitLog({ level: 'warn', runtime: 'stave', message: `${attempted} — ${reason}, so it was left unchanged.` })
}
