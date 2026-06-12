/**
 * "Stave Inputs" reference block + injected-globals hover (#309) — observed
 * end-to-end in the real app (Lokāyata: see the panel + read the hover widget,
 * never infer from "the provider registered").
 *
 *   1. Opening a viz file shows the "Stave Inputs" toggle in its chrome; the
 *      block expands with the ShaderToy-style reference.
 *   2. Hovering an injected token (`sig.rms`) in a viz file shows its doc AND, while
 *      a pattern plays, the LIVE master value.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test viz-stave-inputs.spec.ts --timeout=300000
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
}

async function openVizFile(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).first().click()
  await page.locator('[data-workspace-chrome="viz"]').waitFor({ timeout: 10000 })
  await page.waitForTimeout(400)
}

test.describe('Stave Inputs panel + hover (#309)', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run')

  test('opening a viz file shows the Stave Inputs reference block', async ({ page }) => {
    // The STATIC reference block is now the live-values-OFF fallback (#346 made
    // live values the default). Force it off so this test exercises the static
    // path it asserts on. (Live values get their own observation in
    // viz-inputs-live-values.spec.ts.)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('stave:vizInputsLiveValues', '0')
      } catch {
        /* ignore */
      }
    })
    await boot(page)
    await openVizFile(page, 'spectrum.p5')

    const toggle = page.getByTestId('viz-inputs-toggle')
    await expect(toggle, 'Stave Inputs toggle present on the viz chrome').toBeVisible()

    await toggle.click()
    const block = page.getByTestId('viz-inputs-block')
    await expect(block, 'reference block expands').toBeVisible()
    const text = await block.innerText()
    // eslint-disable-next-line no-console
    console.log('[stave-inputs] block:\n' + text)
    expect(text).toContain('Stave Inputs')
    // spectrum.p5 is a p5 viz → the block speaks the `sig` namespace (#351),
    // NOT the glsl `uKick` uniform names.
    expect(text).toContain('sig.kick')
    expect(text).toContain('sig.fft')
    await page.screenshot({ path: 'test-results/stave-inputs-block.png' })
  })

  test('hovering an injected token shows doc + live master value while playing', async ({ page }) => {
    await boot(page)

    // Start the default pattern so the master bus is live.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
      e?.getModel()?.setValue(`$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`)
      e?.focus()
    })
    await page.keyboard.press(`${MOD}+Enter`)
    await page.waitForTimeout(1500)

    await openVizFile(page, 'spectrum.p5')

    // Put a live token (sig.rms) in the viz editor, then hover the `rms` member.
    const pos = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (window as any).monaco
      const ed = m.editor.getEditors().find((e: any) => e.getModel()?.getLanguageId() === 'p5js')
      if (!ed) return null
      ed.getModel().setValue('function draw(){\n  const r = sig.rms * 100\n  circle(width/2, height/2, r)\n}\n')
      const match = ed.getModel().findMatches('rms', true, false, true, null, false)[0]
      const p = match.range.getStartPosition()
      ed.revealPositionInCenter(p)
      const vp = ed.getScrolledVisiblePosition(p)
      const box = ed.getDomNode().getBoundingClientRect()
      return { x: box.left + vp.left + 4, y: box.top + vp.top + vp.height / 2 }
    })
    expect(pos, 'p5js editor + sig.rms token located').not.toBeNull()
    await page.waitForTimeout(800) // let the probe bind the playing analyser

    await page.mouse.move(pos!.x, pos!.y)
    await page.waitForSelector('.monaco-hover', { timeout: 6000 })
    await page.waitForTimeout(300)
    const hover = await page.locator('.monaco-hover').first().innerText()
    // eslint-disable-next-line no-console
    console.log('[stave-inputs] hover:\n' + hover)
    await page.screenshot({ path: 'test-results/stave-inputs-hover.png' })

    expect(hover, 'hover shows the doc comment').toContain('master-mix DSP')
    expect(hover, 'hover shows the live master value').toContain('live · master')
  })
})
