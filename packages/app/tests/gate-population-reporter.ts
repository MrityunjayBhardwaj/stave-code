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

class GatePopulationReporter implements Reporter {
  private tests = 0
  private files = 0

  onBegin(_config: unknown, suite: Suite): void {
    const all = suite.allTests()
    this.tests = all.length
    this.files = new Set(all.map((t) => t.location.file)).size
  }

  onEnd(): void {
    // A run that collected nothing never had a population — `globalSetup` threw,
    // or the filter matched no file. Printing "covered 0 test(s)" beside that
    // failure reads like a result, and this reporter exists precisely to stop
    // counts being read as more than they are.
    if (this.tests === 0) return

    // eslint-disable-next-line no-console
    console.log(
      `\n  population: this run covered ${this.tests} test(s) in ${this.files} file(s).\n` +
        `  It is a SUBSET of the browser suite, not the whole of it — quote it as ` +
        `"N of <total>", never as a bare number.\n` +
        `  Re-derive the total (never trust a written-down one):\n` +
        `    npx playwright test --project=chromium --list | tail -1\n` +
        `    npx playwright test --project=measurement --list | tail -1\n`,
    )
  }
}

export default GatePopulationReporter
