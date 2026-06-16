import { test, type Page } from '@playwright/test'

/**
 * Diagnostic — WHERE is inline `.viz()` placement allowed?
 * Verifies the code-deduced table: only literal `$:` blocks get a zone;
 * plain labels (`foo:`), `$label:` and bare expressions do not.
 *
 * Run: VIZPLACEMENT=1 pnpm --filter @stave/app exec playwright test viz-placement-forms.spec.ts --headed --timeout=180000 --workers=1
 */

test.use({ viewport: { width: 1200, height: 1100 } })
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const FORMS: Array<{ name: string; code: string; expectZones: number }> = [
  {
    name: 'A control — anonymous $:',
    code: `setcps(130/240)\n$: note("c4 e4 g4 b4").s("sawtooth").gain(0.3).release(0.2).viz("pianoroll")`,
    expectZones: 1,
  },
  {
    // #418 — named labels now get a zone (Tier 1).
    name: 'B plain label — foo:',
    code: `setcps(130/240)\nfoo: note("c4 e4 g4 b4").s("sawtooth").gain(0.3).release(0.2).viz("pianoroll")`,
    expectZones: 1,
  },
  {
    // Bare expressions never call .p() → still no zone (Tier 2, out of scope).
    name: 'C bare expression — no label',
    code: `setcps(130/240)\nnote("c4 e4 g4 b4").s("sawtooth").gain(0.3).release(0.2).viz("pianoroll")`,
    expectZones: 0,
  },
  {
    // #418 — $-prefixed labels are keyed positionally, now placed.
    name: 'D dollar-label — $foo:',
    code: `setcps(130/240)\n$foo: note("c4 e4 g4 b4").s("sawtooth").gain(0.3).release(0.2).viz("pianoroll")`,
    expectZones: 1,
  },
  {
    // #418 — the foot-gun: both tracks now render a zone (was 1).
    name: 'E mix — $: + foo:',
    code: `setcps(130/240)\n$: note("c3 e3").s("sine").gain(0.2).viz("pianoroll")\nfoo: note("g3 b3").s("sine").gain(0.2).viz("spiral")`,
    expectZones: 2,
  },
]

async function probe(page: Page, code: string) {
  const errors: string[] = []
  const onErr = (m: { type: () => string; text: () => string }) => {
    if (m.type() === 'error') errors.push(m.text())
  }
  page.on('console', onErr)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(700)
  await page.evaluate((c) => {
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c) // eslint-disable-line @typescript-eslint/no-explicit-any
  }, code)
  await page.waitForTimeout(150)
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2600)
  const zones = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-viz-zone]')).map((el) => ({
      id: (el as HTMLElement).getAttribute('data-viz-zone-id'),
      track: (el as HTMLElement).getAttribute('data-viz-zone-track'),
    })),
  )
  await page.screenshot({ path: '/tmp/viz-placement-last.png' })
  page.off('console', onErr)
  return { zones, errors }
}

test('inline viz placement — which code forms render a zone', async ({ page }) => {
  test.skip(!process.env.VIZPLACEMENT, 'manual diagnostic — set VIZPLACEMENT=1')
  await page.addInitScript(() => {
    ;(window as any).__STAVE_E2E__ = true // eslint-disable-line @typescript-eslint/no-explicit-any
    try { localStorage.setItem('stave:bottomPanel.open', 'false') } catch { /* ignore */ }
  })
  for (const f of FORMS) {
    const { zones, errors } = await probe(page, f.code)
    const verdict = zones.length === f.expectZones ? 'as-predicted' : 'DIVERGES'
    // eslint-disable-next-line no-console
    console.log(`\n=== [${f.name}] zones=${zones.length} (expected ${f.expectZones}) ${verdict}`)
    // eslint-disable-next-line no-console
    console.log(`    zones: ${JSON.stringify(zones)}`)
    if (errors.length) console.log(`    evalErrors: ${JSON.stringify(errors.slice(0, 3))}`) // eslint-disable-line no-console
  }
})
