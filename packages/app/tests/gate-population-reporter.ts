/**
 * gate-population-reporter — make every browser figure state its population.
 *
 * `gate:editing:browser` names four spec files. It is a fast loop gate, and that
 * is a deliberate choice — but the count it prints ("57 passed") looks exactly
 * like a whole-suite count, so work quoting it has been reporting a green gate
 * that could not have contained the specs it was green about (#1062). The specs
 * that were red were simply not in it.
 *
 * Measured 2026-08-04 via `--list`: the `chromium` project collects 594 tests in
 * 176 files and `measurement` adds 29, so a complete run is 623 — while this
 * gate covers 58 in 4 files, i.e. 9.3%.
 *
 * Those numbers are deliberately NOT hardcoded here. A pinned total is the thing
 * that went stale in the first place (the config's own reconciliation note still
 * said 560), so this reporter derives the covered population from the run it is
 * actually attached to and tells the reader how to re-derive the whole. A figure
 * that recomputes itself cannot drift; one that is written down always can.
 */

import type { Reporter, Suite } from '@playwright/test/reporter'

/**
 * What narrowed this run, read off the actual invocation (#1190).
 *
 * ⚠ THE WORD "SUBSET" USED TO BE HARDCODED HERE, and that was right for exactly as
 * long as this reporter had one caller. `gate:editing:browser:full` runs the whole
 * chromium project, and a reporter that calls every run a SUBSET would mislabel it
 * in the opposite direction — a complete run reading as partial teaches the reader
 * to discount a figure that deserved trust, which is how a green full suite ends up
 * ignored. The sibling `gate-scope-reporter.ts` learned the same lesson for vitest:
 * derive the shape, never declare it.
 *
 * Narrowing is read off `process.argv` — the command as actually invoked.
 *
 * ⚠ NOT off `FullConfig`, though that looks like the tidier source. Measured on this
 * playwright version: under `--grep=velocity`, `config.grep` and every
 * `config.projects[].grep` still read as the match-everything default (dot-star,
 * spelled out here because the literal would close this comment), while the run
 * collected 28 tests of 612.
 * CLI grep is applied during collection and never reflected back onto the config, so
 * a config-based check calls a 28-test run "the WHOLE project". (`config.shard` DOES
 * populate — but a signal that is right for one flag and silently wrong for another
 * is worse than one source that is right for all, so argv is the single source here.)
 *
 * Reading argv also gets the semantics right: narrowing is what the COMMAND added
 * beyond the config. A `grep` set inside `playwright.config.ts` is part of the suite's
 * own definition, not a narrowing of it, and should not be reported as one.
 * Nothing is inferred from the gate's NAME, which is the failure this whole line of
 * work exists to close (#1175, #1183).
 */
/** CLI flags that narrow which tests run. Value-taking, in `--flag=v` or `--flag v` form. */
const NARROWING_FLAGS = ['--grep', '-g', '--grep-invert', '--shard', '--last-failed']

function narrowedBy(argv: string[]): string[] {
  const reasons: string[] = []
  const cmd = argv.indexOf('test')
  if (cmd === -1) return reasons
  const args = argv.slice(cmd + 1)

  // Everything after the `test` subcommand that is not a flag, and is not the VALUE
  // of a value-taking flag, is a path filter. This mirrors how `gateReach.test.ts`
  // reads the vitest gates, deliberately: the two checks should not disagree about
  // what counts as narrowing.
  const positional: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg.startsWith('-')) {
      // `--flag value` consumes the next token; `--flag=value` does not.
      if (!arg.includes('=') && NARROWING_FLAGS.includes(arg)) i += 1
      continue
    }
    positional.push(arg)
  }
  if (positional.length > 0) {
    reasons.push(`${positional.length} path filter(s) on the command line`)
  }

  for (const flag of NARROWING_FLAGS) {
    const hit = args.find((a) => a === flag || a.startsWith(`${flag}=`))
    if (!hit) continue
    const value = hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : args[args.indexOf(hit) + 1]
    reasons.push(value ? `${flag.replace(/^-+/, '')} ${value}` : flag.replace(/^-+/, ''))
  }

  return reasons
}

class GatePopulationReporter implements Reporter {
  private tests = 0
  private files = 0
  private reasons: string[] = []
  private projects: string[] = []

  onBegin(config: unknown, suite: Suite): void {
    const all = suite.allTests()
    this.tests = all.length
    this.files = new Set(all.map((t) => t.location.file)).size
    this.reasons = narrowedBy(process.argv)

    // ⚠ NOT `config.projects` — that lists every project DEFINED, not the ones
    // selected. Under `--project=chromium` it still reports `measurement` too, so
    // naming it here would claim a project ran that never did. Read the projects
    // off the tests that actually exist in this run.
    this.projects = [
      ...new Set(
        all
          .map((t) => (t.parent as { project?: () => { name: string } | undefined }).project?.())
          .map((p) => p?.name)
          .filter((n): n is string => typeof n === 'string'),
      ),
    ]
  }

  onEnd(): void {
    // A run that collected nothing never had a population — `globalSetup` threw,
    // or the filter matched no file. Printing "covered 0 test(s)" beside that
    // failure reads like a result, and this reporter exists precisely to stop
    // counts being read as more than they are.
    if (this.tests === 0) return

    const head =
      this.reasons.length > 0
        ? `  population: this run covered ${this.tests} test(s) in ${this.files} file(s).\n` +
          `  It is a SUBSET of the browser suite, narrowed by ${this.reasons.join(' and ')} —\n` +
          `  quote it as "N of <total>", never as a bare number.`
        : `  population: this run covered ${this.tests} test(s) in ${this.files} file(s),\n` +
          `  which is the WHOLE of project(s) [${this.projects.join(', ')}] — no path filter,\n` +
          `  grep or shard narrowed it. Note "whole project" is not "whole suite": any\n` +
          `  project not listed here (see playwright.config.ts) did not run.`

    // eslint-disable-next-line no-console
    console.log(
      `\n${head}\n` +
        `  Re-derive the total (never trust a written-down one):\n` +
        `    npx playwright test --project=chromium --list | tail -1\n` +
        `    npx playwright test --project=measurement --list | tail -1\n`,
    )
  }
}

export default GatePopulationReporter
