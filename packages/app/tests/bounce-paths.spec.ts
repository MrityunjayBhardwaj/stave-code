import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The instrument behind #1344, #1345 and #1346.
 *
 * Those issues were filed from a throwaway probe that was deleted once it had
 * been read, which is the shape that rots: prose nothing can contradict. Four
 * of the arms below assert a CURRENT DEFECT, so they go RED when the offline
 * renderer starts working. That redness is the notification — when it fires,
 * close the issue and re-point the arm at the fixed behaviour rather than
 * widening it.
 *
 * ONE assertion per test throughout: a second `expect` in a block never runs
 * once the first has failed, and every other block still reports passing.
 */

test.use({
  // The engine's AudioContext has to be allowed to start without a click; the
  // live arm records the real graph, so a suspended context records silence.
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

/** The app's own Starter pattern, read from source so it cannot drift. */
function starterCode(): string {
  const src = readFileSync(resolve(__dirname, '../src/templates.ts'), 'utf8')
  const m = src.match(/export const STRUDEL_CODE = `([\s\S]*?)`;/)
  if (!m) throw new Error('STRUDEL_CODE not found in templates.ts')
  return m[1]
}

/** No `setcps`, no `$:`, no `.viz` — the shape the offline path can render. */
const NO_SETCPS = 'note("c3 e3 g3 b3").s("sawtooth").gain(0.5)'

/**
 * The same shape, but sample-based. Nothing here trips any of the three rungs,
 * so it reaches the renderer — and comes back silent (#1353).
 */
const DRUMS_ONLY = 's("bd*4 hh*8")'
const SYNTH_ONLY = 'note("c3 e3 g3 b3").s("sine")'
const DRUMS_PLUS_SYNTH = 'stack(s("bd*4"), note("c3 e3 g3 b3").s("sine"))'

/** Non-zero sample count — the sharpest available reading of "is this silent". */
function nonZeroCount(mono: Float64Array): number {
  let n = 0
  for (const v of mono) if (v !== 0) n++
  return n
}

async function openApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/')
  await page.waitForFunction(
    () => Boolean((window as unknown as { __staveBounceProbe?: unknown }).__staveBounceProbe),
    undefined,
    { timeout: 60000 },
  )
}

type Outcome = { ok: boolean; error?: string; wav?: string }

function call(
  page: Page,
  method:
    | 'exportLikeButton'
    | 'offlineAfterEvaluate'
    | 'recordLive'
    | 'recordAfterStop',
  code: string,
  secs: number,
): Promise<Outcome> {
  return page.evaluate(
    ([m, c, s]) =>
      (
        window as unknown as {
          __staveBounceProbe: Record<
            string,
            (code: string, secs: number) => Promise<Outcome>
          >
        }
      ).__staveBounceProbe[m as string](c as string, s as number),
    [method, code, secs] as const,
  ) as Promise<Outcome>
}

/** Minimal 16-bit PCM WAV reader — enough to measure, not a decoder. */
function readWav(b64: string): { sampleRate: number; mono: Float64Array } {
  const buf = Buffer.from(b64, 'base64')
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  // walk the chunk list rather than assuming `data` starts at byte 44
  let off = 12
  while (off + 8 <= buf.length && buf.toString('ascii', off, off + 4) !== 'data') {
    off += 8 + buf.readUInt32LE(off + 4)
  }
  const start = off + 8
  const size = buf.readUInt32LE(off + 4)
  const frames = Math.floor(size / (2 * channels))
  const mono = new Float64Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      sum += buf.readInt16LE(start + (i * channels + c) * 2) / 32768
    }
    mono[i] = sum / channels
  }
  return { sampleRate, mono }
}

function peak(mono: Float64Array): number {
  let p = 0
  for (const v of mono) if (Math.abs(v) > p) p = Math.abs(v)
  return p
}

/** Transient count via energy flux on 10ms frames — a note-rate proxy. */
function onsetCount(mono: Float64Array, sampleRate: number): number {
  const hop = Math.floor(sampleRate * 0.01)
  const env: number[] = []
  for (let i = 0; i + hop <= mono.length; i += hop) {
    let e = 0
    for (let j = i; j < i + hop; j++) e += mono[j] * mono[j]
    env.push(Math.sqrt(e / hop))
  }
  const flux = env.slice(1).map((v, i) => Math.max(0, v - env[i]))
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length
  const sd = Math.sqrt(
    flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length,
  )
  const thr = mean + 2 * sd
  let count = 0
  let last = -99
  flux.forEach((v, i) => {
    if (v > thr && i - last > 5) {
      count++
      last = i
    }
  })
  return count
}

type SpikeOutcome = {
  ok: boolean
  error?: string
  workletOk?: boolean
  haps?: number
  wav?: string
}

/** #1398 — drive the offline-superdough spike in the page. */
function callSpike(page: Page, code: string, secs: number): Promise<SpikeOutcome> {
  return page.evaluate(
    ([c, s]) =>
      (
        window as unknown as {
          __staveBounceProbe: {
            offlineSuperdough: (code: string, secs: number) => Promise<SpikeOutcome>
          }
        }
      ).__staveBounceProbe.offlineSuperdough(c as string, s as number),
    [code, secs] as const,
  ) as Promise<SpikeOutcome>
}

test.describe('#1398 — can the REAL graph render offline?', () => {
  /**
   * The spike. `OfflineRenderer` skips every sample-based sound and gives the
   * reason in its own header: "AudioWorklets cannot be re-registered in a fresh
   * OfflineAudioContext." That claim decides whether an offline bounce is a
   * small change or a second synthesis engine maintained forever — and the
   * hand-rolled oscillator renderer, plus #1344/#1345/#1353, all descend from it.
   *
   * Upstream already contradicts it: `@strudel/webaudio` ships
   * `renderPatternAudio`, which builds an OfflineAudioContext, calls
   * `initAudio()` against it, and then the real `superdough()` per hap. Reading
   * that is inference. This arm RUNS it.
   *
   * A DRUM, deliberately: `bd` is exactly the class `OfflineRenderer` drops, so
   * a non-silent render here is the whole answer. No `setcps` in the document,
   * so the arm does not depend on #1344's global-injection rungs.
   */
  test('a sample-based sound renders audibly into an OfflineAudioContext', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openApp(page)

    const out = await callSpike(page, 's("bd*4").bank("RolandTR909")', 4)

    if (!out.ok) {
      throw new Error(
        `offline render failed (workletOk=${out.workletOk}, haps=${out.haps}): ${out.error}`,
      )
    }
    // The pattern really produced events, so a silent buffer would mean the
    // AUDIO failed rather than that there was nothing to render.
    expect(out.haps, 'the pattern produced no onsets to render').toBeGreaterThanOrEqual(4)

    const { sampleRate, mono } = readWav(out.wav!)
    console.log(
      `[#1398] haps=${out.haps} peak=${peak(mono).toFixed(4)} nonZero=${nonZeroCount(mono)}/${mono.length} onsets=${onsetCount(mono, sampleRate)}`,
    )

    // ⚠ NON-SILENCE, not non-emptiness. A valid, full-length WAV of pure
    // silence is the failure shape BOTH existing renderers already have, and
    // it is the outcome an `ok` flag cannot see.
    expect(peak(mono), 'the offline render came back silent').toBeGreaterThan(0.01)
    // Four onsets in four seconds at 0.5cps — the drums are actually THERE,
    // not one click or a burst of noise.
    expect(onsetCount(mono, sampleRate)).toBeGreaterThanOrEqual(3)
  })
})

test.describe('the three audio-bounce paths', () => {
  test('the live path records audible audio from the Starter pattern (#1346)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const out = await call(page, 'recordLive', starterCode(), 3)
    // Real-time capture: 3s of audio costs 3s. Peak measured 0.96 on trunk;
    // 0.05 asks only "is this audible", so a mix change cannot redden it.
    expect({
      ok: out.ok,
      audible: out.wav ? peak(readWav(out.wav).mono) > 0.05 : false,
    }).toEqual({ ok: true, audible: true })
  })

  test('the export button cannot render the Starter pattern — rung 1, setcps (#1344)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const out = await call(page, 'exportLikeButton', starterCode(), 2)
    // `setcps` is not a module export: @strudel/core/repl.mjs registers it inside
    // injectPatternMethods(), which the repl calls at the top of its OWN evaluate.
    expect({ ok: out.ok, mentionsSetcps: /setcps is not defined/.test(out.error ?? '') })
      .toEqual({ ok: false, mentionsSetcps: true })
  })

  test('one evaluate gets past setcps and stops at .viz — rung 2 (#1344)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const out = await call(page, 'offlineAfterEvaluate', starterCode(), 2)
    // `.viz` is installed on Pattern.prototype during StrudelEngine.evaluate and
    // deleted again afterwards — correct by design, and it means the offline
    // renderer's own evaluate can never see it.
    expect({ ok: out.ok, mentionsViz: /\.viz is not a function/.test(out.error ?? '') })
      .toEqual({ ok: false, mentionsViz: true })
  })

  test('stripping .viz reveals rung 3, the $: track syntax (#1344)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const stripped = starterCode().replace(/\s*\.viz\("[^"]*"\)/g, '')
    const out = await call(page, 'offlineAfterEvaluate', stripped, 2)
    // `$:` transpiles to `.p(...)`, installed and deleted the same way. This is
    // the rung that makes the ladder structural: practically every document we
    // produce uses `$:`.
    expect({ ok: out.ok, mentionsP: /\.p is not a function/.test(out.error ?? '') })
      .toEqual({ ok: false, mentionsP: true })
  })

  test('after init, setcps is absent while the other globals are present (#1344)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    // Boot the engine the way the export button does, then census globalThis.
    await call(page, 'exportLikeButton', NO_SETCPS, 1)
    const census = await page.evaluate(() =>
      (
        window as unknown as {
          __staveBounceProbe: { globalsCensus(): Record<string, string> }
        }
      ).__staveBounceProbe.globalsCensus(),
    )
    // This is the whole diagnosis in one line: evalScope over the eight modules
    // supplies the pattern vocabulary and cannot supply setcps.
    expect(census).toEqual({
      setcps: 'undefined',
      note: 'function',
      stack: 'function',
      s: 'function',
      sound: 'function',
    })
  })

  test('a pattern without setcps renders at double speed offline (#1345)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const out = await call(page, 'offlineAfterEvaluate', NO_SETCPS, 8)
    if (!out.ok) throw new Error(`offline render failed: ${out.error}`)
    const { sampleRate, mono } = readWav(out.wav!)
    // extractCps returns 1 when the code has no setcps (OfflineRenderer.ts:87);
    // Strudel's real default is 0.5. Four notes per cycle => 2/s correct, 4/s
    // observed. Measured on trunk: 31 offline against 16 live over 8s. The
    // threshold sits between the two so it flips when #1345 is fixed.
    expect(onsetCount(mono, sampleRate)).toBeGreaterThanOrEqual(24)
  })

  test('a drum-only bounce comes back silent, and says nothing (#1353)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const out = await call(page, 'exportLikeButton', DRUMS_ONLY, 4)
    // toOscType returns null for every sample-based sound and the hap is
    // `continue`d (OfflineRenderer.ts:65) with no counter and no diagnostic.
    // Measured on trunk: 0 of 192,000 samples non-zero, zero console errors.
    // Asserting the SUCCESS as well as the silence is the point — an error
    // would be a lesser bug than a well-formed empty file.
    expect({
      ok: out.ok,
      nonZero: out.wav ? nonZeroCount(readWav(out.wav).mono) : -1,
    }).toEqual({ ok: true, nonZero: 0 })
  })

  test('adding drums to a working render changes nothing at all (#1353)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    const synth = await call(page, 'exportLikeButton', SYNTH_ONLY, 4)
    const mixed = await call(page, 'exportLikeButton', DRUMS_PLUS_SYNTH, 4)
    if (!synth.ok || !mixed.ok) {
      throw new Error(`render failed: ${synth.error ?? ''} ${mixed.error ?? ''}`)
    }
    // The contrast that makes the drop undeniable: a render that plainly WORKS,
    // with drums stacked into it, is byte-identical to the same render without
    // them. This is a stronger control than a live comparison because it needs
    // no real-time capture and cannot be blamed on a missing sample fetch.
    expect(Buffer.from(mixed.wav!, 'base64').equals(Buffer.from(synth.wav!, 'base64')))
      .toBe(true)
  })
})

/**
 * #1356 — how long does the graph keep sounding AFTER the transport stops?
 *
 * Stopping halts Strudel's scheduler but does not cancel Web Audio nodes
 * already scheduled in the lookahead window. If that tail is long, a bounce
 * started right after a stop records the previous take under the opening of the
 * new one. If it is short, the modal interaction alone outlasts it and there is
 * nothing to fix. The number decides whether the reported bug binds.
 */
test('#1356 the tail after stop decays quickly', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page)
  const out = await call(page, 'recordAfterStop', starterCode(), 8)
  expect(out.ok, out.error ?? '').toBe(true)
  const { sampleRate, mono } = readWav(out.wav!)

  // Per-250ms RMS, so the decay is visible as a curve rather than one number.
  const win = Math.floor(sampleRate / 4)
  const curve: string[] = []
  for (let i = 0; i + win <= mono.length; i += win) {
    let sum = 0
    for (let j = i; j < i + win; j++) sum += mono[j] * mono[j]
    curve.push((Math.sqrt(sum / win)).toFixed(4))
  }
  // Last window above an audible floor, in ms.
  let lastAudible = 0
  curve.forEach((v, i) => { if (Number(v) > 0.005) lastAudible = (i + 1) * 250 })

  // Measured: near-full level for a full second, then silence.
  //   0.1280 0.1146 0.1042 0.0894 0.0120 0.0000 0.0000 ...   lastAudible 1250ms
  // This is the budget `StrudelEngine.waitUntilQuiet` has to cover before a
  // bounce may start. If the tail ever outgrew that 2500ms ceiling the settle
  // would time out and contamination would return silently — which is what
  // this arm is here to catch.
  expect(lastAudible).toBeLessThan(2500)
})
