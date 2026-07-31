/**
 * A probe must not be collected as a gate (#1111).
 *
 * This directory holds two different kinds of file, and the difference is the
 * EXTENSION, not the `_` prefix:
 *
 *   *.test.ts   → vitest collects it. These are the gates; they assert, and they
 *                 run on every `pnpm --filter @stave/app test`.
 *   _*.spec.ts  → collected by NEITHER runner. Vitest's `include` only matches
 *                 `*.test.ts`, and `playwright.config.ts` ignores this whole
 *                 directory via `VITEST_ONLY`. These are maintainer-run probes:
 *                 they print, they need not assert, and they may be slow.
 *
 * The `_` prefix is only a human marker. Nothing enforced the pairing, so a probe
 * saved as `_name.test.ts` reads as inert while vitest happily runs it — which is
 * exactly what `_1107-beyond-cap.test.ts` did, adding ~78s and an assertion-free
 * `✓ 1 passed` to the suite for three commits (#1110 → #1111).
 *
 * This gate closes that gap: an underscore-prefixed file in here must be a
 * `.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('#1111 — probes stay out of the collected suite', () => {
  const entries = readdirSync(here)

  // Control arm. If the directory read ever breaks or moves, every assertion
  // below would pass over an empty list and this gate would silently stop
  // guarding anything. A zero-hit scan is not absence.
  it('can see this directory and the probes already in it', () => {
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.filter((f) => /^_.*\.spec\.tsx?$/.test(f)).length).toBeGreaterThan(0)
    expect(entries.filter((f) => /\.test\.tsx?$/.test(f)).length).toBeGreaterThan(0)
  })

  it('has no underscore-prefixed *.test.ts — a probe named that way gets collected', () => {
    const collectedProbes = entries.filter((f) => /^_.*\.test\.tsx?$/.test(f)).sort()
    expect(collectedProbes).toEqual([])
  })
})
