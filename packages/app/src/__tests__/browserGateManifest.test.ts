/**
 * browserGateManifest — every browser spec is classified, so none can go unrun quietly (#1265).
 *
 * WHAT WENT WRONG WITHOUT THIS. `gate:editing:browser` names its spec files by hand.
 * The list was written at #952 with four files and grew exactly once, at #1245. Three
 * specs added after that — `resolver-opens-a-grid` (#1247), `chord-chart-grid` (#1252)
 * and `counted-but-empty-views` (#1258) — were never added to it, and each of them is
 * the ONLY arm that mounts the panel it covers; `chord-chart-grid.spec.ts` says so in
 * its own docblock. A fourth, `sequencer-projection.spec.ts`, then went red and stayed
 * red, and no gate had anything to say about it (#1266).
 *
 * The list being short is a cost decision and a defensible one. The list being able to
 * fall behind SILENTLY is the defect, and it is the only thing these arms are about.
 *
 * ⚠ THIS ASSERTS A CLASSIFICATION, NEVER A TOTAL. `gatePopulationReporter.test.ts`
 * already argues why a pinned count is the wrong instrument here: it "would fail on
 * every honest spec addition and teach the next person to update it without reading
 * why." A count asks you to bump a number. This asks a question — is the new spec in
 * the gate, and if not, why not — and the answer is written down next to the file it is
 * about. Adding a spec still reddens this, on purpose; what changes is that clearing it
 * requires a sentence rather than an increment.
 *
 * The manifest is deliberately unflattering. 178 of 191 files currently say "not yet
 * triaged", which is the real size of the gap #1265 is about, stated rather than
 * implied by a number nobody computes. It is meant to shrink.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const APP = path.resolve(__dirname, '..', '..')
const TESTS = path.join(APP, 'tests')
const MANIFEST = path.join(TESTS, 'browser-gate-manifest.json')

type Runs = 'gate' | 'measurement' | 'ungated'
interface Entry {
  runs: Runs
  why: string
}

const manifest: Record<string, Entry> = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

/** Browser specs are the `.spec.ts` files directly under `tests/`; `parity-corpus/` is vitest-only. */
const onDisk = fs
  .readdirSync(TESTS)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort()

/** The spec paths named on the `gate:editing:browser` command line. */
function gateScriptSpecs(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, '..', '..', 'package.json'), 'utf8'))
  const script: string = pkg.scripts['gate:editing:browser']
  return [...script.matchAll(/tests\/([\w.-]+\.spec\.ts)/g)].map((m) => m[1]).sort()
}

/** `MEASUREMENT_SPECS` from the Playwright config, read from its source rather than duplicated. */
function measurementSpecs(): string[] {
  const src = fs.readFileSync(path.join(APP, 'playwright.config.ts'), 'utf8')
  const block = /const MEASUREMENT_SPECS = \[([\s\S]*?)\]/.exec(src)
  expect(block, 'MEASUREMENT_SPECS not found in playwright.config.ts').not.toBeNull()
  return [...block![1].matchAll(/\*\*\/([\w.-]+\.spec\.ts)/g)].map((m) => m[1]).sort()
}

describe('#1265 — the browser gate list cannot fall behind quietly', () => {
  it('classifies every browser spec on disk, and no spec that is not there', () => {
    const listed = Object.keys(manifest).sort()
    // Named both ways: the failure has to say WHICH file, or it teaches nothing.
    expect(onDisk.filter((f) => !(f in manifest)), 'specs on disk with no manifest entry — add one saying whether it is in the gate, and why').toEqual([])
    expect(listed.filter((f) => !onDisk.includes(f)), 'manifest entries whose spec file is gone — delete them').toEqual([])
  })

  it('agrees with the gate script about which specs the gate runs', () => {
    const claimed = Object.entries(manifest)
      .filter(([, e]) => e.runs === 'gate')
      .map(([f]) => f)
      .sort()
    // Both directions. A file added to the script but not the manifest is fine for
    // coverage and still a drift; a file the manifest calls gated that the script does
    // not name is the #1265 defect itself, wearing a label that says otherwise.
    expect(claimed).toEqual(gateScriptSpecs())
  })

  it('agrees with the Playwright config about which specs are serialised for measurement', () => {
    const claimed = Object.entries(manifest)
      .filter(([, e]) => e.runs === 'measurement')
      .map(([f]) => f)
      .sort()
    expect(claimed).toEqual(measurementSpecs())
  })

  it('gives every ungated spec a stated reason', () => {
    const silent = Object.entries(manifest)
      .filter(([, e]) => e.runs === 'ungated' && e.why.trim().length < 10)
      .map(([f]) => f)
    expect(silent, 'ungated specs whose reason says nothing').toEqual([])
  })

  it('is non-vacuous — the gate actually names specs, and the manifest is not empty', () => {
    expect(gateScriptSpecs().length).toBeGreaterThan(0)
    expect(onDisk.length).toBeGreaterThan(100)
  })
})
