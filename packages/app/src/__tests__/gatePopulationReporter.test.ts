/**
 * gate-population-reporter — the browser gate's scope line is derived, not asserted (#1190).
 *
 * The word "SUBSET" used to be hardcoded in this reporter, which was correct for as
 * long as it had exactly one caller. `gate:editing:browser:full` runs the whole
 * chromium project, and a reporter calling that a SUBSET mislabels it in the other
 * direction — a complete run reading as partial teaches the reader to discount a
 * figure that deserved trust, which is one way a green full suite comes to be ignored.
 *
 * ⚠ THESE ARMS ASSERT SHAPE, NEVER TOTALS. The chromium project was 594 tests on
 * 2026-08-04 and 612 on 2026-08-07; pinning a number here would fail on every honest
 * spec addition and teach the next person to update it without reading why. What must
 * hold is that a narrowed run says SUBSET and names what narrowed it, and an
 * unnarrowed one says WHOLE and names only the projects that actually ran.
 *
 * They run with `--list`, so no browser starts and no server is needed: the reporter's
 * hooks fire during collection, which is all these assertions need. That keeps the arms
 * at seconds rather than the ~6 minutes a real full run costs.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const APP = resolve(__dirname, '..', '..')

/** List (never execute) the browser suite with the population reporter attached. */
function listWith(extraArgs: string[]): string {
  try {
    return execFileSync(
      'npx',
      [
        'playwright',
        'test',
        ...extraArgs,
        '--project=chromium',
        '--list',
        '--reporter=./tests/gate-population-reporter.ts',
      ],
      {
        cwd: APP,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120_000,
        // The port guard (#1155) is irrelevant to `--list`, but keep the run off
        // port 3000, which belongs to an unrelated app on this machine.
        env: { ...process.env, STAVE_E2E_PORT: '3123' },
      },
    )
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
}

describe('#1190 — the browser gate states whether it covered the whole project', () => {
  it('naming spec files is reported as a SUBSET, and says what narrowed it', () => {
    const out = listWith(['tests/velocity.spec.ts'])
    expect(out).toContain('It is a SUBSET of the browser suite')
    expect(out).toContain('path filter(s) on the command line')
  }, 120_000)

  it('an unnarrowed project run is reported as the WHOLE project', () => {
    const out = listWith([])
    expect(out).toContain('which is the WHOLE of project(s) [chromium]')
    expect(out).not.toContain('It is a SUBSET of the browser suite')

    // THE REGRESSION ARM. `config.projects` lists every project DEFINED, not the
    // ones selected — under `--project=chromium` it still contains `measurement`.
    // Reading the project names from there claimed a project had run that never did.
    expect(
      out,
      'the scope line named a project that did not run — read the names off the ' +
        'tests in the run, not off config.projects',
    ).not.toContain('measurement]')
  }, 120_000)

  it('--grep and --shard are detected as narrowing too, not just paths', () => {
    // Narrowing has three routes and the reporter must catch all of them; a check
    // that only understood path filters would call a sharded run "the WHOLE".
    const grepped = listWith(['--grep=velocity'])
    expect(grepped).toContain('It is a SUBSET of the browser suite')
    expect(grepped).toContain('grep')

    const sharded = listWith(['--shard=1/2'])
    expect(sharded).toContain('It is a SUBSET of the browser suite')
    expect(sharded).toContain('shard 1/2')
  }, 120_000)
})
