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

  it('gate:editing:app runs vitest with no path filter', () => {
    const cmd = scripts['gate:editing:app']
    expect(cmd, 'the root package.json no longer defines gate:editing:app').toBeTruthy()

    // Everything after `vitest run` that is not a flag (or a flag's value) is a
    // path filter, and a path filter is what put 646 tests outside every gate.
    const after = cmd.slice(cmd.indexOf('vitest run') + 'vitest run'.length).trim()
    const positional = after.split(/\s+/).filter((t) => t.length > 0 && !t.startsWith('-'))

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
    const withFilter = 'pnpm --filter @stave/app exec vitest run tests/parity-corpus'
    const after = withFilter.slice(withFilter.indexOf('vitest run') + 'vitest run'.length).trim()
    const positional = after.split(/\s+/).filter((t) => t.length > 0 && !t.startsWith('-'))
    expect(positional).toEqual(['tests/parity-corpus'])
  })
})
