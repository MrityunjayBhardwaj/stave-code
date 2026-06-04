import { test, expect } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ── Q3 PRE-FLIGHT SPIKE (issue #237) ────────────────────────────────────────
// Does hydra-synth render to an OffscreenCanvas inside a Web Worker? Drives
// packages/app/public/spike/hydra-worker.js with a real transferred
// OffscreenCanvas and reads pixels back. OBSERVE, don't infer.
//
// Run: pnpm --filter @stave/app exec playwright test b-preflight-hydra.spec.ts

const SPIKE_DIR = join(__dirname, '..', 'public', 'spike')
const HYDRA_DST = join(SPIKE_DIR, 'hydra-synth.js')
const HYDRA_SRC = join(
  __dirname,
  '..',
  '..',
  'editor',
  'node_modules',
  'hydra-synth',
  'dist',
  'hydra-synth.js'
)

test.beforeAll(() => {
  if (!existsSync(HYDRA_DST)) {
    mkdirSync(dirname(HYDRA_DST), { recursive: true })
    copyFileSync(HYDRA_SRC, HYDRA_DST)
  }
})

test('Q3: hydra-synth renders to an OffscreenCanvas inside a Web Worker', async ({
  page,
}) => {
  const logs: string[] = []
  page.on('console', (m) => logs.push(`[page:${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

  await page.goto('/')

  const result = await page.evaluate(async () => {
    const W = 256
    const H = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const offscreen = canvas.transferControlToOffscreen()

    // hydra worker is a CLASSIC worker (importScripts the UMD bundle).
    const worker = new Worker('/spike/hydra-worker.js')
    const stages: unknown[] = []
    const workerLogs: string[] = []

    const done = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker timed out (no done in 10s)')), 10000)
      worker.onmessage = (e) => {
        const d = e.data
        if (d?.type === 'stage') stages.push(d)
        if (d?.type === 'workerlog') workerLogs.push(d.line)
        if (d?.type === 'done') {
          clearTimeout(t)
          resolve({ ...d, workerLogs })
        }
      }
      worker.onerror = (e) => {
        clearTimeout(t)
        reject(new Error(`worker error: ${e.message} @ ${e.filename}:${e.lineno}`))
      }
      worker.postMessage(
        { canvas: offscreen, scriptUrl: '/spike/hydra-synth.js', width: W, height: H },
        [offscreen]
      )
    }).catch((err) => ({ type: 'error', error: String(err?.message || err) }))

    worker.terminate()
    return { done, stages }
  })

  console.log('\n══════════ Q3 HYDRA WORKER SPIKE — OBSERVED ══════════')
  for (const s of result.stages as Array<Record<string, unknown>>) {
    console.log(`\n[${s.stage}] ${s.status}`)
    console.log('  ', JSON.stringify(s.detail))
  }
  const done = result.done as Record<string, unknown> | null
  const wl = (done?.workerLogs as string[]) || []
  if (wl.length) console.log('\n── worker diagnostics ──\n' + wl.join('\n'))
  console.log('\n── VERDICT ──')
  console.log(JSON.stringify({ verdict: done?.verdict, at: done?.at, pixels: done?.pixels }, null, 2))
  if (logs.length) console.log('\n── page console ──\n' + logs.join('\n'))
  console.log('═══════════════════════════════════════════════\n')

  expect(done, 'worker produced a verdict').not.toBeNull()
  expect(done?.type, 'worker did not hard-error in the harness').not.toBe('error')
  expect(done?.verdict, 'hydra rendered in the worker').toBe('YES')
  const px = done?.pixels as { nonBlank: number } | undefined
  expect(px?.nonBlank ?? 0, 'rendered non-blank pixels').toBeGreaterThan(0)
})
