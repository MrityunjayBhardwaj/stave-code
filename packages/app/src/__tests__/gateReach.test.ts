/**
 * gateReach — `gate:editing:app` still reaches this package's own unit tests (#1175).
 *
 * This file is deliberately circular: it is part of the suite it pins. If the
 * gate stops reaching `src/**`, this test stops running, and the thing it
 * asserts stops being checked. That is not a defect in the design — it is the
 * cheapest available statement of the property, because the failure it guards
 * against is precisely "the gate silently covers less than its name says", and
 * a gate that no longer runs this file has already announced that by dropping
 * its test count. The count is the signal; this file explains what the count
 * meant.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `gate:editing:app` used to be `vitest run tests/parity-corpus` — filtered to
 * the corpus directory, so this package's 646 unit tests in 46 files were in NO
 * gate at all. That was not a mistake anyone made carelessly: the filter was
 * added so the corpus timing stayed legible, which is a real concern. It just
 * also excluded the `src` unit tests, and no gate's NAME says "and not the app's
 * unit tests", so a green board read as a covered tree.
 *
 * What it cost, measured rather than argued: deleting the body of
 * `declaredTracks` — the structural row source the whole Song timeline is built
 * from, so that no document declares any track — left all four gates green.
 * Seven tests reddened, all of them in this package's `src/`, none in the
 * corpus. The Song timeline could lose every row and the board stayed clean.
 *
 * ⚠ THE FILTER IS THE THING TO GUARD, NOT THE COUNT. Pinning a test total here
 * would fail on every honest addition and teach the next person to update the
 * number without reading why. What must not silently change is the gate's
 * REACH: whether the command restricts vitest to a subdirectory.
 *
 * ── #1379: THE ENTRY POINT MOVED ─────────────────────────────────────────────
 * The gate no longer spells `vitest run` literally — it runs `vitest-guard.mjs`,
 * a wrapper that raises the worker heap ceiling and makes a killed run legible,
 * and that passes every argument through untouched. The PROPERTY is unchanged
 * (no positional path filter); only the token the read anchors on moved.
 *
 * That change broke this test's READ before it broke anything real, and the way
 * it broke is worth keeping in mind: `indexOf('vitest run')` returned -1, the
 * slice ran from the wrong offset, and the assertion failed on garbage tokens.
 * It failed loudly only by luck — a slightly different command string would have
 * sliced to `[]` and PASSED, reporting "no filter" for a command the read no
 * longer understood. So the parse now returns an explicit sentinel when it finds
 * no entry point at all, and a control arm pins that. A read that cannot find
 * what it is reading must fail, never agree.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** the repo root, three levels up from `packages/app/src/__tests__` */
const ROOT = join(__dirname, '..', '..', '..', '..')

describe('#1175 — the app gate reaches this package, not a subdirectory of it', () => {
  const scripts = (
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
  ).scripts

  /**
   * The vitest entry point in a gate command: vitest itself, or the #1379 guard
   * that wraps it and forwards every argument. Anything after it that is not a
   * flag is a path filter — and a path filter is what put 646 tests outside
   * every gate.
   */
  const ENTRY = /vitest run|vitest-guard\.mjs/

  /** `NO_ENTRY` rather than `[]`: a read that cannot find its anchor must FAIL. */
  const NO_ENTRY = ['<no vitest entry point found in the command>']

  const positionalsAfterEntry = (cmd: string): string[] => {
    const m = ENTRY.exec(cmd)
    if (!m) return NO_ENTRY
    const after = cmd.slice(m.index + m[0].length).trim()
    return after.split(/\s+/).filter((t) => t.length > 0 && !t.startsWith('-'))
  }

  it('gate:editing:app runs vitest with no path filter', () => {
    const cmd = scripts['gate:editing:app']
    expect(cmd, 'the root package.json no longer defines gate:editing:app').toBeTruthy()

    const positional = positionalsAfterEntry(cmd)

    expect(
      positional,
      `gate:editing:app restricts vitest to ${positional.join(', ')}. Anything the ` +
        'filter excludes is in no gate — which is how the Song timeline came to be ' +
        'uncovered. Widen the gate, or give the excluded tests a gate of their own.',
    ).toEqual([])
  })

  it('control arm: the same read would SEE a path filter if one were there', () => {
    // Without this, a broken read (wrong path, renamed key, changed shape) would
    // report "no filter" and look exactly like the property holding.
    expect(
      positionalsAfterEntry('pnpm --filter @stave/app exec vitest run tests/parity-corpus'),
    ).toEqual(['tests/parity-corpus'])
  })

  it('control arm: it sees a filter through the #1379 guard too', () => {
    // The guard forwards arguments, so a filter smuggled in behind it is just
    // as excluding as one after a bare `vitest run`.
    expect(
      positionalsAfterEntry(
        'pnpm --filter @stave/app exec node scripts/vitest-guard.mjs tests/parity-corpus',
      ),
    ).toEqual(['tests/parity-corpus'])
  })

  it('control arm: a command it cannot parse FAILS rather than reporting "no filter"', () => {
    // The #1379 lesson. When the entry token moved, the old read sliced from
    // offset -1 and could have agreed with itself on garbage.
    expect(positionalsAfterEntry('pnpm --filter @stave/app exec some-other-runner')).toEqual(
      NO_ENTRY,
    )
  })
})
