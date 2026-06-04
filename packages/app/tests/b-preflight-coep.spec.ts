import { test, expect, type Page } from '@playwright/test'

// ── Q2 PRE-FLIGHT SPIKE (issue #237) ────────────────────────────────────────
// Can Next 16.2.1 enable cross-origin isolation (→ SharedArrayBuffer, the planned
// Phase B per-frame viz-signal transport) WITHOUT breaking audio? COOP+COEP added
// in next.config.ts (COEP=credentialless). OBSERVE with the headers on:
//   1. crossOriginIsolated === true + SharedArrayBuffer allocatable
//   2. AudioContext running + audio.triggers > 0 (superdough/AudioWorklet survives)
//   3. no cross-origin subresource (sample pack) blocked by COEP
//
// REQUIRES the dev server restarted with the new next.config.ts headers.
// Run: pnpm --filter @stave/app exec playwright test b-preflight-coep.spec.ts

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test('Q2: COOP/COEP enables crossOriginIsolated+SAB without breaking audio', async ({
  page,
}) => {
  const blocked: string[] = []
  const consoleErrs: string[] = []
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText ?? ''
    // COEP blocks surface as net::ERR_BLOCKED_BY_RESPONSE / NotSameOriginAfterDefaultedToSameOriginByCoep
    blocked.push(`${r.url()} — ${f}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text())
  })

  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)

  // ── 1. isolation + SAB (platform observation) ──
  const iso = await page.evaluate(() => {
    let sabOk = false
    let sabErr = ''
    try {
      const sab = new SharedArrayBuffer(1024)
      sabOk = sab.byteLength === 1024
    } catch (e) {
      sabErr = String((e as Error)?.message || e)
    }
    return {
      crossOriginIsolated: (globalThis as { crossOriginIsolated?: boolean })
        .crossOriginIsolated,
      hasSAB: typeof SharedArrayBuffer === 'function',
      sabOk,
      sabErr,
    }
  })

  // ── 2. boot audio: a SAMPLE sound (bank → CDN samples) + a SYNTH sound ──
  await setCode(
    page,
    [
      `$: s("bd*4, ~ sd").bank("RolandTR909")`,
      `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(800)`,
    ].join('\n')
  )
  await runCode(page)

  const acState = await page.evaluate(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).getAudioContext?.()?.state ?? 'none'
    } catch {
      return 'error'
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).__stavePerf?.reset?.())
  await page.waitForTimeout(3500)
  const snap = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__stavePerf?.snapshot?.()
  )
  const triggers = snap?.counters?.['audio.triggers'] ?? 0
  const trigPerSec = snap?.uptimeMs ? (triggers / snap.uptimeMs) * 1000 : 0

  // COEP-blocked subresources (samples/fonts). credentialless should NOT block.
  const coepBlocked = blocked.filter(
    (b) => /coep|ERR_BLOCKED_BY_RESPONSE|NotSameOrigin/i.test(b)
  )

  // ── REPORT (the output IS the finding) ──
  console.log('\n══════════ Q2 COOP/COEP + AUDIO — OBSERVED ══════════')
  console.log('crossOriginIsolated :', iso.crossOriginIsolated)
  console.log('SharedArrayBuffer   :', iso.hasSAB, '| allocatable:', iso.sabOk, iso.sabErr)
  console.log('audioContext.state  :', acState)
  console.log('audio.triggers      :', triggers, `(~${trigPerSec.toFixed(1)}/s)`)
  console.log('COEP-blocked reqs   :', coepBlocked.length)
  if (coepBlocked.length) console.log('  ' + coepBlocked.slice(0, 10).join('\n  '))
  if (blocked.length) {
    console.log('\nALL failed requests (' + blocked.length + '):')
    console.log('  ' + blocked.slice(0, 15).join('\n  '))
  }
  if (consoleErrs.length)
    console.log('\nconsole errors:\n  ' + consoleErrs.slice(0, 10).join('\n  '))
  console.log('═══════════════════════════════════════════════\n')

  // ── ASSERT ──
  expect(iso.crossOriginIsolated, 'cross-origin isolation enabled by COOP/COEP').toBe(true)
  expect(iso.sabOk, 'SharedArrayBuffer allocatable under isolation').toBe(true)
  expect(acState, 'AudioContext is running (AudioWorklet booted under isolation)').toBe(
    'running'
  )
  expect(triggers, 'audio scheduler fired triggers (superdough survives isolation)').toBeGreaterThan(
    0
  )
  expect(
    coepBlocked.length,
    `credentialless COEP did not block subresources: ${coepBlocked.join(', ')}`
  ).toBe(0)
})
