import { test, expect } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ── B-0 FEASIBILITY SPIKE (issue #235) ──────────────────────────────────────
// Can the p5 WEBGL renderer move off the main thread into a Web Worker via an
// OffscreenCanvas? This drives packages/app/public/spike/p5-worker.js with a
// REAL transferred OffscreenCanvas in a REAL browser worker and reads the
// verdict + the recording-shim surface. OBSERVE pixels-out, don't infer.
//
// Run: PERF_SPIKE=1 pnpm --filter @stave/app exec playwright test b0-worker-spike.spec.ts
//
// Self-provisioning: copies the standalone p5 ESM bundle into public/spike so
// the 1MB vendor file need not be committed.

const SPIKE_DIR = join(__dirname, '..', 'public', 'spike')
const P5_DST = join(SPIKE_DIR, 'p5.esm.min.js')
const P5_SRC = join(
  __dirname,
  '..',
  '..',
  'editor',
  'node_modules',
  'p5',
  'lib',
  'p5.esm.min.js'
)

test.beforeAll(() => {
  if (!existsSync(P5_DST)) {
    mkdirSync(dirname(P5_DST), { recursive: true })
    copyFileSync(P5_SRC, P5_DST)
  }
})

test('B-0: p5 v2 renders to an OffscreenCanvas inside a Web Worker', async ({
  page,
}) => {
  const logs: string[] = []
  page.on('console', (m) => logs.push(`[page:${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))

  await page.goto('/')

  const result = await page.evaluate(async () => {
    // Verify the platform supports the transfer at all (Phase B fallback gate).
    const probe = document.createElement('canvas')
    const canTransfer = typeof probe.transferControlToOffscreen === 'function'
    if (!canTransfer) {
      return {
        platform: { canTransfer: false },
        done: null as Record<string, unknown> | null,
        stages: [] as unknown[],
        mainThread: { longtasks: 0, maxLongtask: 0 },
      }
    }

    const W = 256
    const H = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const offscreen = canvas.transferControlToOffscreen()

    // Observe whether the worker draw blocks the MAIN thread (PV69 goal):
    // count main-thread long tasks while the worker renders.
    let longtasks = 0
    let maxLongtask = 0
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longtasks++
          maxLongtask = Math.max(maxLongtask, e.duration)
        }
      })
      po.observe({ entryTypes: ['longtask'] })
    } catch {
      /* longtask API may be unavailable */
    }

    const worker = new Worker('/spike/p5-worker.js', { type: 'module' })
    const stages: unknown[] = []
    const workerLogs: string[] = []

    const done = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('worker timed out (no done message in 10s)')),
        10000
      )
      worker.onmessage = (e) => {
        const d = e.data
        if (d?.type === 'stage') stages.push(d)
        if (d?.type === 'workerlog') workerLogs.push(d.line)
        if (d?.type === 'done') {
          clearTimeout(timeout)
          resolve({ ...d, workerLogs })
        }
      }
      worker.onerror = (e) => {
        clearTimeout(timeout)
        reject(new Error(`worker error: ${e.message} @ ${e.filename}:${e.lineno}`))
      }
      worker.postMessage({ canvas: offscreen, width: W, height: H }, [offscreen])
    }).catch((err) => ({ type: 'error', error: String(err?.message || err) }))

    worker.terminate()
    return { platform: { canTransfer: true }, done, stages, mainThread: { longtasks, maxLongtask } }
  })

  // ── Report everything (this is a spike; the OUTPUT is the finding) ──
  console.log('\n══════════ B-0 WORKER SPIKE — OBSERVED ══════════')
  console.log('platform.canTransferControlToOffscreen:', result.platform.canTransfer)
  for (const s of result.stages as Array<Record<string, unknown>>) {
    console.log(`\n[${s.stage}] ${s.status}`)
    console.log('  ', JSON.stringify(s.detail))
  }
  const done = result.done as Record<string, unknown> | null
  const wl = (done?.workerLogs as string[]) || []
  if (wl.length) {
    console.log('\n── worker diagnostics (p5 FES / rejections) ──')
    console.log(wl.join('\n'))
  }
  console.log('\n── touched DOM surface (the minimal-shim answer) ──')
  console.log(JSON.stringify((done?.touched as unknown) ?? {}, null, 2))
  console.log('\n── VERDICT ──')
  console.log(JSON.stringify({ verdict: done?.verdict, at: done?.at, pixels: done?.pixels }, null, 2))
  console.log('\n── main thread while worker drew ──')
  console.log(JSON.stringify(result.mainThread))
  if (logs.length) console.log('\n── page console ──\n' + logs.join('\n'))
  console.log('═══════════════════════════════════════════════\n')

  // The spike PROVED p5 v2 renders WEBGL to an OffscreenCanvas in a worker.
  // Lock it as a regression guard: verdict YES + the sketch's green rect
  // (0,255,0) is at the canvas centre over a red field.
  expect(done, 'worker produced a verdict').not.toBeNull()
  expect(done?.type, 'worker did not hard-error in the harness').not.toBe('error')
  expect(result.platform.canTransfer, 'transferControlToOffscreen available').toBe(true)
  expect(done?.verdict, 'p5 rendered in the worker').toBe('YES')
  const px = done?.pixels as { nonBlank: number; center: number[] } | undefined
  expect(px?.nonBlank ?? 0, 'rendered non-blank pixels').toBeGreaterThan(0)
  // centre is the green rect: G dominant, R/B low
  expect(px?.center?.[1] ?? 0, 'centre green channel high').toBeGreaterThan(200)
  expect(px?.center?.[0] ?? 255, 'centre red channel low').toBeLessThan(80)
})
