import { test, expect, type Page, type CDPSession } from '@playwright/test'

import { bootApp, seedCode } from './_appBoot'

/**
 * #1755 — an offline render leaves nothing behind once it ends.
 *
 * Every waveform the Song timeline draws for a synth track, and every bounce,
 * is an `OfflineAudioContext` holding the whole rendered audio (a 512 s stereo
 * track is ~197 MB). A context that has loaded audio worklets is never
 * collected in Chromium, so superdough's `initAudio` loading them into every
 * render kept every one of them: measured, 4 waveform passes took the renderer
 * from 329 to 1,938 MB. A render now loads worklets only when a note needs one.
 *
 * Counted the way the leak was found: after a forced GC, how many
 * `OfflineAudioContext` objects are still alive (`Runtime.queryObjects`).
 *
 *  1. A song whose sounds need no worklet: after three waveform passes and a
 *     bounce, none is alive.
 *  2. A song that plays a worklet sound (supersaw) still draws it: the render
 *     that needs worklets still loads them. That context is still kept by the
 *     browser; the arm prints how many are alive rather than asserting it.
 */

async function envelopes(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('[data-full-song-envelopes]')?.getAttribute('data-full-song-envelopes') ?? '')
}

async function rendering(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('[data-full-song-envelope-rendering]')?.getAttribute('data-full-song-envelope-rendering') ?? '',
  )
}

/** Offline contexts still alive after a forced garbage collection. */
async function liveOfflineContexts(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage')
  const { result: proto } = await cdp.send('Runtime.evaluate', { expression: 'OfflineAudioContext.prototype' })
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId! })
  const { result } = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId!,
    functionDeclaration: 'function () { return this.length }',
    returnByValue: true,
  })
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: '' }).catch(() => {})
  return result.value as number
}

/** Seed `code` and wait until every lane's envelope has been rendered for it. */
async function drawn(page: Page, code: string, lanes: string): Promise<void> {
  await seedCode(page, code)
  await expect.poll(() => envelopes(page), { timeout: 60_000 }).toBe(lanes)
  await expect.poll(() => rendering(page), { timeout: 10_000 }).toBe('')
}

async function bounce(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  const dialog = page.getByRole('dialog', { name: 'Bounce to WAV' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '30s' }).click()
  const download = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  await download
}

/** Two synth tracks, 64 cycles long; `cutoff` changes what both play. */
const plain = (cutoff: number) =>
  'setcps(0.5)\n' +
  `$: arrange([64, note("<c3 e3 g3 b3>*8").s("sawtooth").lpf(${cutoff})])\n` +
  `$: arrange([64, note("<g2 b2 d3>*4").s("square").lpf(${cutoff})])`

test.describe.configure({ mode: 'serial' })

test('a song with no worklet sound keeps no offline render alive (#1755)', async ({ page }) => {
  test.setTimeout(180_000)
  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 360 } })
  const cdp = await page.context().newCDPSession(page)
  const alive: number[] = []
  for (const cutoff of [800, 1200, 1600]) {
    await drawn(page, plain(cutoff), 'd1:fresh d2:fresh')
    alive.push(await liveOfflineContexts(cdp))
  }
  await bounce(page)
  await expect.poll(() => rendering(page), { timeout: 10_000 }).toBe('')
  alive.push(await liveOfflineContexts(cdp))
  console.log(`[#1755 plain] live offline contexts after passes 1-3, then a bounce: ${alive.join(' ')}`)
  // Before #1755 (measured on the same spec): 2, 2, 4, 5 — every render kept.
  expect(alive).toEqual([0, 0, 0, 0])
})

test('a worklet sound still renders; its render is the one that loads worklets (#1755)', async ({ page }) => {
  test.setTimeout(120_000)
  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 360 } })
  const cdp = await page.context().newCDPSession(page)
  await drawn(
    page,
    'setcps(0.5)\n' +
      '$: arrange([64, note("<c3 e3>*4").s("supersaw").gain(0.3)])\n' +
      '$: arrange([64, note("<g2 b2>*4").s("sawtooth")])',
    'd1:fresh d2:fresh',
  )
  // The supersaw lane has a drawn envelope, so its render made sound: a render
  // that dropped the note for want of a worklet would come back silent, and a
  // silent render draws nothing.
  const alive = await liveOfflineContexts(cdp)
  console.log(`[#1755 supersaw] live offline contexts after one pass: ${alive} (the supersaw track's render loads worklets)`)
})
