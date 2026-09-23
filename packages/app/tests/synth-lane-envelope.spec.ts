import { test, expect, type Page } from '@playwright/test'

import { bootApp, seedCode } from './_appBoot'

/**
 * #1731 — a synth track draws its own loudness on the Song timeline, rendered
 * offline from its own pattern, and only while the transport is stopped.
 *
 * Three claims, each read off the running app:
 *
 *  1. A stopped document's collapsed synth lane carries an envelope that TRACKS
 *     GAIN: the lane-coloured ink stands taller in a loud cycle than in a quiet
 *     one. Measured as a DIFFERENCE between two cycles of one snapshot, never an
 *     absolute count — the note mark in each cycle is the same height, so only
 *     the envelope can make them differ. A drum lane (files) gets none: its
 *     waveform is the files' own (#1730).
 *  2. An edit made while playing marks exactly the edited track stale, and the
 *     next stop renders it fresh again.
 *  3. Play pressed while a render is in flight starts at once rather than after
 *     the render: the render is aborted, not waited out.
 *
 * Slots are measured off the ruler's own ticks, never off the ink being judged
 * (the lesson of #1730's instruments), and ink is matched to the LANE'S OWN hue,
 * read off its swatch, so clip borders and other overlays cannot count.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function envelopes(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('[data-full-song-envelopes]')?.getAttribute('data-full-song-envelopes') ?? '')
}

async function rendering(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('[data-full-song-envelope-rendering]')?.getAttribute('data-full-song-envelope-rendering') ?? '',
  )
}

/**
 * Rows of the lane's band holding lane-hue ink across at least a tenth of the
 * middle of `cycle`'s slot, in backing-store pixels.
 */
async function inkRows(page: Page, laneKey: string, cycle: number): Promise<number> {
  return page.evaluate(
    ({ key, cycle }) => {
      const canvas = document.querySelector('[data-full-song-canvas]') as HTMLCanvasElement | null
      const row = document.querySelector(`[data-full-song-lane="${key}"]`) as HTMLElement | null
      const dot = document.querySelector(`[data-full-song-lane-dot="${key}"]`) as HTMLElement | null
      if (!canvas || !row || !dot) return -1
      const rgb = (getComputedStyle(dot).backgroundColor.match(/\d+(\.\d+)?/g) ?? []).map(Number)
      const hueOf = (r: number, g: number, b: number) => {
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max === min) return { h: 0, s: 0, v: max }
        const d = max - min
        let h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d
        h = (h * 60 + 360) % 360
        return { h, s: d / max, v: max }
      }
      const lane = hueOf(rgb[0], rgb[1], rgb[2])
      const cr = canvas.getBoundingClientRect()
      const rr = row.getBoundingClientRect()
      const dpr = canvas.width / cr.width
      // Slot from the ruler: the tick labelled `cycle` and the next one.
      const ticks = Array.from(document.querySelectorAll('[data-full-song-tick]')).map((t) => ({
        label: (t.textContent ?? '').trim(),
        left: t.getBoundingClientRect().left,
      }))
      const a = ticks.find((t) => t.label === String(cycle))
      const b = ticks.find((t) => t.label === String(cycle + 1))
      if (!a || !b) return -2
      const x0 = Math.round((a.left - cr.left + (b.left - a.left) * 0.2) * dpr)
      const x1 = Math.round((a.left - cr.left + (b.left - a.left) * 0.8) * dpr)
      const y0 = Math.max(0, Math.round((rr.top - cr.top) * dpr))
      const h = Math.round(rr.height * dpr)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx || x1 <= x0) return -3
      const data = ctx.getImageData(x0, y0, x1 - x0, h).data
      let rows = 0
      for (let y = 0; y < h; y++) {
        let hits = 0
        for (let x = 0; x < x1 - x0; x++) {
          const i = (y * (x1 - x0) + x) * 4
          const p = hueOf(data[i], data[i + 1], data[i + 2])
          const dh = Math.min(Math.abs(p.h - lane.h), 360 - Math.abs(p.h - lane.h))
          if (p.s > 0.4 && p.v > 40 && dh < 25) hits++
        }
        if (hits >= (x1 - x0) * 0.1) rows++
      }
      return rows
    },
    { key: laneKey, cycle },
  )
}

async function waitForEnvelopes(page: Page, want: string, timeout = 20_000): Promise<void> {
  await expect.poll(() => envelopes(page), { timeout }).toBe(want)
}

test.describe('synth lane envelope (#1731)', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page, { drawer: { tabId: 'musical-timeline', height: 360 } })
  })

  test('a stopped synth lane draws an envelope that follows its gain; a drum lane draws none', async ({ page }) => {
    // One sustained note per cycle, getting louder each cycle.
    await seedCode(page, 'setcps(0.5)\n$: note("c3").s("sine").gain("<0.1 0.4 0.7 1>")\n$: s("bd*4")')
    await waitForEnvelopes(page, 'd1:fresh')
    const quiet = await inkRows(page, 'd1', 0)
    // Cycle 2 (gain 0.7), not 3: a four-cycle song has no tick for cycle 4 to
    // close cycle 3's slot.
    const loud = await inkRows(page, 'd1', 2)
    console.log(`[#1731] ink rows: quiet cycle ${quiet}, loud cycle ${loud}`)
    await page.locator('[data-full-song-canvas]').screenshot({ path: 'test-results/synth-lane-envelope-gain.png' })
    expect(quiet).toBeGreaterThan(0) // the note mark itself is drawn in both
    expect(loud - quiet).toBeGreaterThanOrEqual(4)
  })

  test('an edit while playing marks only that track stale, and stopping renders it again', async ({ page }) => {
    const before = 'setcps(0.5)\n$: note("c3*2").s("sawtooth")\n$: note("e2").s("square")'
    await seedCode(page, before)
    await waitForEnvelopes(page, 'd1:fresh d2:fresh')

    await page.locator('.monaco-editor').first().click()
    await page.keyboard.press(`${MOD}+Enter`)
    await page.locator('[data-full-song="playhead"]').waitFor({ timeout: 10_000 })
    await seedCode(page, before.replace('note("c3*2")', 'note("c3*4")'))
    await page.locator('.monaco-editor').first().click()
    await page.keyboard.press(`${MOD}+Enter`)
    await waitForEnvelopes(page, 'd1:stale d2:fresh')
    // Still playing: nothing renders until the transport stops.
    await page.waitForTimeout(1500)
    expect(await envelopes(page)).toBe('d1:stale d2:fresh')
    await page.screenshot({ path: 'test-results/synth-lane-envelope-stale.png' })

    await page.keyboard.press(`${MOD}+Period`)
    await waitForEnvelopes(page, 'd1:fresh d2:fresh')
  })

  test('Play pressed during a render starts at once instead of waiting for it', async ({ page }) => {
    // One long, dense track, so a render is seconds of work and certainly in
    // flight when Play is pressed.
    const code = 'setcps(0.5)\n$: arrange([256, note("c3*8 e3*8").s("sawtooth").lpf(1200)])'
    await seedCode(page, code)
    await waitForEnvelopes(page, 'd1:fresh', 60_000)

    // Baseline: evaluate-and-play with no render running.
    const playLatency = async (): Promise<number> => {
      await page.locator('.monaco-editor').first().click()
      const t0 = Date.now()
      await page.keyboard.press(`${MOD}+Enter`)
      await page.locator('[data-full-song="playhead"]').waitFor({ timeout: 30_000 })
      return Date.now() - t0
    }
    const idle = await playLatency()
    await page.keyboard.press(`${MOD}+Period`)
    await page.locator('[data-full-song="playhead"]').waitFor({ state: 'detached', timeout: 10_000 })

    // A new document to render, then Play the moment the render starts.
    await seedCode(page, code.replace('lpf(1200)', 'lpf(900)'))
    await expect.poll(() => rendering(page), { timeout: 30_000, intervals: [20] }).not.toBe('')
    const during = await playLatency()
    console.log(`[#1731] evaluate-and-play: idle ${idle} ms, during a render ${during} ms`)
    expect(during - idle).toBeLessThan(400)
    await page.keyboard.press(`${MOD}+Period`)
  })
})
