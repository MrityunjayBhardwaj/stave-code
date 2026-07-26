/**
 * stringParser.test.ts — what a bare string becomes when Strudel reifies it (#1018).
 *
 * Three settings are possible and two of them are wrong, in opposite directions:
 *
 *   none      no parser         `note('c4 e4')` plays ONE note valued `"c4 e4"` — silent,
 *                               wrong music, no error anywhere.
 *   bare      `miniAllStrings()` `s('bd').label('🍕')` THROWS and takes the document with
 *                               it — the mini parser will not have a non-notation string.
 *   fallback  the shipped rule   mini when it parses, the plain value when it does not.
 *
 * The project shipped BOTH errors simultaneously: the engine installed `bare` (so the
 * live app threw on the emoji) while the measurement harness installed `none` (so it
 * scored documents the app would have failed). Every assertion here is written against
 * all three so the contrast is visible rather than asserted.
 */
import { describe, it, expect } from 'vitest'

import { clearStringParser, installMiniStringParser } from '../stringParser'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Mode = 'none' | 'bare' | 'fallback'

async function evalHaps(code: string, mode: Mode): Promise<{ ok: boolean; values: unknown[]; error?: string }> {
  const core: any = await import('@strudel/core')
  const mini: any = await import('@strudel/mini')
  const tonal: any = await import('@strudel/tonal')
  await core.evalScope(core, mini, tonal)
  if (mode === 'bare') mini.miniAllStrings()
  else if (mode === 'fallback') installMiniStringParser({ core, mini })
  else clearStringParser({ core })
  try {
    const { transpiler }: any = await import('@strudel/transpiler')
    const out = await core.evaluate(code, transpiler)
    const pat = out.pattern ?? out
    const haps = pat.queryArc(0, 1).filter((h: any) => h.hasOnset?.() ?? true)
    return { ok: true, values: haps.map((h: any) => h.value) }
  } catch (e) {
    return { ok: false, values: [], error: String((e as Error).message) }
  } finally {
    // the parser is a module-global in @strudel/core — leaving it set would hand the
    // next test in this process someone else's dialect, with no error to show for it
    clearStringParser({ core })
  }
}

describe('the string parser Strudel reifies bare strings through', () => {
  it("pattern-parses a single-quoted mini — `note('c4 e4')` is two notes, not one string", async () => {
    const fixed = await evalHaps("note('c4 e4')", 'fallback')
    expect(fixed.ok).toBe(true)
    expect(fixed.values).toEqual([{ note: 'c4' }, { note: 'e4' }])

    // the contrast: with NO parser it is one hap whose value is the whole string. No
    // error, no warning — just the wrong music, which is why this one went unnoticed.
    const unparsed = await evalHaps("note('c4 e4')", 'none')
    expect(unparsed.ok).toBe(true)
    expect(unparsed.values).toEqual([{ note: 'c4 e4' }])
  }, 60_000)

  it('does NOT throw on a single-quoted string that is not notation — the bug that shipped', async () => {
    const fixed = await evalHaps("s('bd').label('🍕')", 'fallback')
    expect(fixed.ok, fixed.error).toBe(true)
    expect(fixed.values).toEqual([{ s: 'bd', label: '🍕' }])

    // RED TEST, and it is a statement about what the live app did until this landed:
    // `StrudelEngine.init()` called `miniAllStrings()` bare, so this document threw.
    const bare = await evalHaps("s('bd').label('🍕')", 'bare')
    expect(bare.ok).toBe(false)
    expect(bare.error).toMatch(/parse error/)
  }, 60_000)

  it('leaves the transpiler’s own path alone — a double-quoted mini is unaffected', async () => {
    // The transpiler rewrites double-quoted and template strings into located mini calls
    // before `reify` ever sees them, so they arrive as Patterns and the parser is not
    // consulted. Asserted across all three settings: if any of them differed, the fix
    // would be reaching somewhere it has no business reaching.
    for (const mode of ['none', 'bare', 'fallback'] as const) {
      const r = await evalHaps('note("c4 e4")', mode)
      expect(r.ok, `${mode}: ${r.error}`).toBe(true)
      expect(r.values, mode).toEqual([{ note: 'c4' }, { note: 'e4' }])
    }
  }, 60_000)

  it('restores the bare behaviour when cleared', async () => {
    const core: any = await import('@strudel/core')
    const mini: any = await import('@strudel/mini')
    installMiniStringParser({ core, mini })
    expect((core.reify('c4 e4') as any).queryArc(0, 1).length).toBe(2)
    clearStringParser({ core })
    expect((core.reify('c4 e4') as any).queryArc(0, 1).length).toBe(1)
  }, 60_000)
})
