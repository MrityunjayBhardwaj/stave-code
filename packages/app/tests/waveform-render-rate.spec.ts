import { test, expect, type Page } from '@playwright/test'

import { bootApp, seedCode } from './_appBoot'

/**
 * #1759 — a synth track that plays nothing but plain oscillators draws from a
 * 24 kHz render, and counts half against the render budget, so a long song's
 * last tracks are not "too long to draw".
 *
 * Every `OfflineAudioContext` render is logged with its length and rate, so the
 * two kinds are told apart by what the browser was asked to do:
 *
 *  1. Four oscillator tracks of 374 s each (1,496 s, past the 1,200 s budget at
 *     full rate) all draw, each from a 24 kHz render, with no notice. Before
 *     #1759: the fourth was "too long to draw", every render at 48 kHz.
 *  2. A track that also plays a sample renders at the live rate: superdough
 *     caches a decoded sample at the rate of the first context to load it.
 */

async function attr(page: Page, name: string): Promise<string> {
  return page.evaluate((a) => document.querySelector(`[${a}]`)?.getAttribute(a) ?? '', name)
}

const osc = (name: string, sound: string) =>
  `${name}: arrange([187, note("<c3 e3 g3 b3>*4").s("${sound}").lpf(1200).gain(0.3)])`

test('a long song of oscillator tracks draws every one, from 24 kHz renders (#1759)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    // Init scripts also run in every frame, and #1758 renders in a throwaway
    // frame: each copy records into the TOP window, and only the top resets it.
    const w = (window.top ?? window) as unknown as { __renders: string[] }
    if (window === window.top) w.__renders = []
    const start = OfflineAudioContext.prototype.startRendering
    OfflineAudioContext.prototype.startRendering = function (this: OfflineAudioContext) {
      w.__renders.push(`${Math.round(this.length / this.sampleRate)}s@${this.sampleRate}`)
      return start.call(this)
    }
  })
  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 360 } })
  const live = await page.evaluate(() => new AudioContext().sampleRate)
  test.skip(live <= 24000, `the live rate is ${live} Hz, at or below the display rate: nothing to lower`)

  await seedCode(
    page,
    [
      'setcps(0.5)',
      osc('bass', 'sawtooth'),
      osc('keys', 'triangle'),
      osc('pad', 'supersaw'),
      osc('lead', 'square'),
      'mixed: arrange([187, note("c3 e3").s("<sawtooth bd>")])',
    ].join('\n'),
  )
  await expect
    .poll(() => attr(page, 'data-full-song-envelopes'), { timeout: 120_000 })
    .toBe('bass:fresh keys:fresh pad:fresh lead:fresh mixed:fresh')
  await expect.poll(() => attr(page, 'data-full-song-envelope-rendering'), { timeout: 10_000 }).toBe('')
  const renders = await page.evaluate(() => (window as unknown as { __renders: string[] }).__renders)
  console.log(`[#1759] live ${live} Hz · renders: ${renders.join(' ')}`)

  // Nothing is left out: 4 × 374 s at half weight + 374 s at full = 1,122 s.
  await expect(page.getByText(/too long to draw/)).toHaveCount(0)
  // Every oscillator track rendered at 24 kHz (supersaw's worklet-free first try,
  // #1755, is dropped before it renders). The mixed track, at the live rate.
  expect(renders.filter((r) => r === '374s@24000').length).toBeGreaterThanOrEqual(4)
  expect(renders.filter((r) => r === `374s@${live}`)).toHaveLength(1)
  expect(renders.every((r) => r === '374s@24000' || r === `374s@${live}`)).toBe(true)
})

/**
 * #1760 — the budget is spent on the lanes on screen first. Twelve 374 s
 * oscillator tracks cost 187 s each (#1759), so six fit the 1,200 s budget. In
 * a short drawer the top lanes draw; scrolled to the bottom, the lanes then on
 * screen draw too, and none already drawn is rendered again.
 */
test('scrolling a long song brings the lanes on screen into the budget, re-rendering none (#1760)', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => {
    // Init scripts also run in every frame, and #1758 renders in a throwaway
    // frame: each copy records into the TOP window, and only the top resets it.
    const w = (window.top ?? window) as unknown as { __renders: string[] }
    if (window === window.top) w.__renders = []
    const start = OfflineAudioContext.prototype.startRendering
    OfflineAudioContext.prototype.startRendering = function (this: OfflineAudioContext) {
      w.__renders.push(`${Math.round(this.length / this.sampleRate)}s@${this.sampleRate}`)
      return start.call(this)
    }
  })
  await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 220 } })
  const names = Array.from({ length: 12 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`)
  await seedCode(page, ['setcps(0.5)', ...names.map((n) => osc(n, 'sawtooth'))].join('\n'))

  const fresh = async () => (await attr(page, 'data-full-song-envelopes')).split(' ').filter((x) => x.endsWith(':fresh')).map((x) => x.split(':')[0])
  const inView = () =>
    page.evaluate(() => {
      const grid = document.querySelector('[data-full-song="grid"]')!.getBoundingClientRect()
      return [...document.querySelectorAll<HTMLElement>('[data-full-song-lane]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.height > 0 && r.top < grid.bottom - 1 && r.bottom > grid.top + 1
        })
        .map((el) => el.getAttribute('data-full-song-lane')!)
    })
  const settled = () => expect.poll(() => attr(page, 'data-full-song-envelope-rendering'), { timeout: 60_000 }).toBe('')

  await expect.poll(async () => (await fresh()).length, { timeout: 120_000 }).toBe(6)
  await settled()
  const before = await fresh()
  const renders = async () => (await page.evaluate(() => (window as unknown as { __renders: string[] }).__renders)).length
  const rendersBefore = await renders()
  expect(before).toEqual(names.slice(0, 6))

  await page.evaluate(() => {
    const grid = document.querySelector('[data-full-song="grid"]') as HTMLElement
    grid.scrollTop = grid.scrollHeight
  })
  // The label gutter follows the grid's scroll in its scroll handler.
  await expect.poll(inView, { timeout: 5_000 }).toContain('t12')
  const shown = await inView()
  expect(shown).not.toContain('t01')
  await expect.poll(async () => (await fresh()).filter((n) => shown.includes(n)).length, { timeout: 120_000 }).toBe(shown.length)
  await settled()
  const after = await fresh()
  const newRenders = (await renders()) - rendersBefore
  console.log(`[#1760] in view after scroll: ${shown.join(',')} · drawn before: ${before.join(',')} · after: ${after.join(',')} · new renders: ${newRenders}`)
  // Every lane drawn before still draws: nothing kept was thrown away …
  for (const n of before) expect(after, n).toContain(n)
  // … and only the lanes that had no render were rendered.
  expect(newRenders).toBe(shown.filter((n) => !before.includes(n)).length)
})
