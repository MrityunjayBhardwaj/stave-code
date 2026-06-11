import { test, expect, type Page } from '@playwright/test'

// ── B-1 PRE-FLIGHT SPIKE (Phase B, epic #228) ───────────────────────────────
// The whole Phase B plan rests on the COOP=same-origin + COEP=credentialless
// header (Q2, LIVE on `performance`). COOP `same-origin` severs cross-window
// DOM relationships (window.opener, synchronous popup.document access). The
// plan named PopoutPreview.tsx as the present casualty — but GROUNDING the code
// shows `usePopoutPreview` is NEVER imported in live src (the Cmd+K W command
// calls `shell.openPopoutPreview?.()`, which the app never implements → no-op).
// So there is no LIVE pop-out today. This spike still characterises COOP's
// effect on the EXACT pattern PopoutPreview uses (window.open('') + synchronous
// popup.document createElement/appendChild/body.style, lines 53-83, 95), because
// the pop-out WILL be wired eventually and a future worker-hosting popup needs
// `crossOriginIsolated` to inherit into the popup.
//
// OBSERVE (don't infer) under the live header:
//   1. does window.open('') still open a popup?
//   2. does synchronous popup.document access still work (no SecurityError)?
//   3. can we build + mount DOM in the popup (createElement/appendChild/style)?
//   4. does the popup inherit crossOriginIsolated? (it'll need it to host a
//      worker renderer with SAB later)
//
// REQUIRES the dev server restarted with the live next.config.ts headers (P83).
// Run: pnpm --filter @stave/app exec playwright test b1-coop-popout.spec.ts

test('B-1: COOP same-origin — window.open popup + synchronous popup.document survive; isolation inheritance', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)

  // Confirm the opener is itself cross-origin isolated (header is live).
  const openerIso = await page.evaluate(
    () => (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
  )

  // ── Replicate PopoutPreview's exact cross-window-DOM sequence in the page ──
  // Mirrors PopoutPreview.tsx:53-83 + 95 (window.open + synchronous popup.document
  // manipulation + a mounted child). Every access wrapped so a SecurityError is
  // reported, not thrown away.
  const obs = await page.evaluate(() => {
    const r: Record<string, unknown> = {}
    let popup: Window | null = null
    try {
      popup = window.open(
        '',
        'viz-popout-spike',
        'width=800,height=600,menubar=no,toolbar=no,location=no,status=no'
      )
      r.opened = !!popup
    } catch (e) {
      r.opened = false
      r.openError = String((e as Error)?.message || e)
      return r
    }
    if (!popup) {
      r.opened = false
      r.note = 'window.open returned null (popup blocked or COOP severed)'
      return r
    }
    // 2 + 3: synchronous document access + DOM build (PopoutPreview:67-76)
    try {
      popup.document.title = 'Viz: spike'
      popup.document.body.style.margin = '0'
      popup.document.body.style.background = '#090912'
      r.bodyExists = !!popup.document.body
      const container = popup.document.createElement('div')
      container.style.width = '100vw'
      container.style.height = '100vh'
      popup.document.body.appendChild(container)
      r.containerMounted = popup.document.body.children.length > 0
      // A canvas child — the thing a renderer would draw into.
      const canvas = popup.document.createElement('canvas')
      container.appendChild(canvas)
      r.canvasMounted = !!container.querySelector('canvas')
      r.docAccessOk = true
    } catch (e) {
      r.docAccessOk = false
      r.docError = String((e as Error)?.message || e)
    }
    // 4: does the popup inherit cross-origin isolation? (needed to host a
    //    worker + SharedArrayBuffer later)
    try {
      r.popupCrossOriginIsolated = (
        popup as unknown as { crossOriginIsolated?: boolean }
      ).crossOriginIsolated
      r.popupHasSAB =
        typeof (popup as unknown as { SharedArrayBuffer?: unknown })
          .SharedArrayBuffer === 'function'
    } catch (e) {
      r.isoError = String((e as Error)?.message || e)
    }
    // window.opener round-trip (COOP same-origin can null this out)
    try {
      r.openerReachable = popup.opener === window
    } catch (e) {
      r.openerError = String((e as Error)?.message || e)
    }
    popup.close()
    return r
  })

  // ── REPORT (the output IS the finding) ──
  console.log('\n══════════ B-1 COOP + window.open POPUP — OBSERVED ══════════')
  console.log('opener crossOriginIsolated :', openerIso)
  console.log('popup opened               :', obs.opened)
  if (obs.openError) console.log('  open error               :', obs.openError)
  if (obs.note) console.log('  note                     :', obs.note)
  console.log('synchronous doc access ok  :', obs.docAccessOk)
  if (obs.docError) console.log('  doc error                :', obs.docError)
  console.log('  body exists              :', obs.bodyExists)
  console.log('  container mounted        :', obs.containerMounted)
  console.log('  canvas mounted           :', obs.canvasMounted)
  console.log('popup crossOriginIsolated  :', obs.popupCrossOriginIsolated)
  console.log('popup has SharedArrayBuffer:', obs.popupHasSAB)
  console.log('window.opener reachable    :', obs.openerReachable)
  console.log('=============================================================\n')

  // Cross-check: Playwright also sees the popup as a page (context-level view).
  const popupPages = context.pages().length
  console.log('context page count after open/close:', popupPages)

  // ── Observe the RAW worker-viz capability facts in the LIVE environment ──
  // We deliberately read only the primitive facts here (no transport policy):
  // these five being present IS the precondition for the `sab` transport. The
  // facts → VizTransport mapping is owned + unit-tested by detectWorkerVizCapabilities
  // (visualizers/worker/capabilities.test.ts) — duplicating the if/else here would
  // just risk drift. The spike's job is to prove the live app supplies every `sab`
  // prerequisite under the header.
  const caps = await page.evaluate(() => {
    const isFn = (v: unknown) => typeof v === 'function'
    const g = globalThis as Record<string, unknown> & {
      crossOriginIsolated?: boolean
      HTMLCanvasElement?: { prototype?: { transferControlToOffscreen?: unknown } }
    }
    return {
      crossOriginIsolated: g.crossOriginIsolated === true,
      hasOffscreenCanvas: isFn(g.OffscreenCanvas),
      hasSharedArrayBuffer: isFn(g.SharedArrayBuffer),
      hasWorker: isFn(g.Worker),
      canTransferControl: isFn(
        g.HTMLCanvasElement?.prototype?.transferControlToOffscreen
      ),
    }
  })
  console.log('\n── live worker-viz capability facts (real app env) ──')
  console.log('  crossOriginIsolated  :', caps.crossOriginIsolated)
  console.log('  OffscreenCanvas      :', caps.hasOffscreenCanvas)
  console.log('  SharedArrayBuffer    :', caps.hasSharedArrayBuffer)
  console.log('  Worker               :', caps.hasWorker)
  console.log('  transferControl      :', caps.canTransferControl)
  console.log('  ⇒ all `sab` prereqs  :', Object.values(caps).every(Boolean))
  // Every `sab` precondition present in the live app → detectWorkerVizCapabilities
  // resolves to 'sab' (that derivation is asserted in the unit test).
  expect(
    Object.values(caps).every(Boolean),
    'live app supplies every prerequisite for the SAB transport under the header'
  ).toBe(true)

  // ── ASSERT the present-state finding ──
  expect(openerIso, 'opener is cross-origin isolated (header live)').toBe(true)
  // The core B-1 question: does COOP same-origin break the pop-out pattern?
  expect(obs.opened, 'window.open still opens a popup under COOP same-origin').toBe(true)
  expect(
    obs.docAccessOk,
    'synchronous popup.document access survives COOP same-origin'
  ).toBe(true)
  expect(obs.canvasMounted, 'a canvas can be mounted in the popup DOM').toBe(true)
})
