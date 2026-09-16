/**
 * Uncaught errors a test left behind in the page (#1647).
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────
 * Every test that rendered a bounce over live audio passed while the browser logged
 * `Uncaught InvalidAccessError … different audio context` 3–5 times per run (#1639).
 * Each one checked audio statistics and none of them looked at errors, so the tests
 * aimed at the failure could not see it.
 *
 * ─── WHY IN-PAGE LISTENERS, NOT `page.on('pageerror')` ─────────────────────────
 * `pageerror` has undercounted this class of error before. These listeners are
 * installed with `addInitScript`, so they run before the app's first line. On #1639's
 * six tests their counts matched the dev server's forwarded `Uncaught` lines one for
 * one (5/3/3/3/3/4, controls 0/0).
 *
 * ─── WHY IT ALSO WATCHES `connect` ──────────────────────────────────────────────
 * The error's message names neither node, and its stack is all superdough, which the
 * dev server's source mapping hides. A failed `AudioNode.connect` is recorded with the
 * class and context of each end and the event being dispatched, so a red test says
 * WHICH connection crossed contexts, not only that one did. The throw is re-raised
 * unchanged.
 *
 * ⚠ Call {@link watchUncaught} BEFORE the page navigates: an init script only reaches
 * documents loaded after it is added.
 */
import { expect, type Page } from '@playwright/test'

export type PageFault =
  | { kind: 'uncaught' | 'rejection'; message: string; stack: string }
  | { kind: 'connect'; message: string; stack: string; from: string; to: string; event: string | null }

export async function watchUncaught(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __staveFaults?: unknown[] }
    if (w.__staveFaults) return
    const faults: unknown[] = []
    w.__staveFaults = faults
    const stackOf = (s: string | undefined) => (s ?? '').split('\n').slice(0, 12).join('\n')

    // Contexts are named by class and creation order ("AudioContext#1",
    // "OfflineAudioContext#2"), assigned on every connect so the order is stable.
    const names = new WeakMap<object, string>()
    const counts: Record<string, number> = {}
    const nameOf = (ctx: BaseAudioContext) => {
      let name = names.get(ctx)
      if (!name) {
        const cls = ctx.constructor.name
        counts[cls] = (counts[cls] ?? 0) + 1
        name = `${cls}#${counts[cls]}`
        names.set(ctx, name)
      }
      return name
    }
    const describe = (node: unknown) =>
      node instanceof AudioNode ? `${node.constructor.name}(${nameOf(node.context)})` : 'AudioParam'

    const realConnect = AudioNode.prototype.connect
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(AudioNode.prototype as any).connect = function (this: AudioNode, ...args: any[]) {
      const from = describe(this)
      const to = describe(args[0])
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (realConnect as any).apply(this, args)
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ev = (window as any).event as Event | undefined
        faults.push({
          kind: 'connect',
          message: String(err),
          stack: stackOf(new Error().stack),
          from,
          to,
          event: ev ? `${ev.type}@${(ev.target as object | null)?.constructor?.name}` : null,
        })
        throw err
      }
    }

    // Capture phase, so a listener that stops propagation cannot hide an error.
    window.addEventListener(
      'error',
      (e) => faults.push({ kind: 'uncaught', message: e.message, stack: stackOf(e.error?.stack) }),
      true,
    )
    window.addEventListener('unhandledrejection', (e) =>
      faults.push({ kind: 'rejection', message: String(e.reason), stack: stackOf(e.reason?.stack) }),
    )
  })
}

export async function readFaults(page: Page): Promise<PageFault[]> {
  return page.evaluate(() => ((window as unknown as { __staveFaults?: PageFault[] }).__staveFaults ?? []).slice())
}

/**
 * The page holds no uncaught error and no unhandled rejection.
 *
 * `settleMs` lets callbacks the test's last step scheduled (a node's `ended` event,
 * say) fire before the count is read.
 *
 * ⚠ A failed `connect` that the app CAUGHT is reported in the message for context
 * but does not fail the assertion by itself: only what escaped counts here.
 */
export async function expectNoUncaught(page: Page, settleMs = 500): Promise<void> {
  await page.waitForTimeout(settleMs)
  const faults = await readFaults(page)
  const escaped = faults.filter((f) => f.kind !== 'connect')
  const detail = faults
    .map((f) =>
      f.kind === 'connect' ? `connect ${f.from} -> ${f.to} during ${f.event ?? 'no event'}` : `${f.kind}: ${f.message}`,
    )
    .join('\n')
  expect(escaped.length, `the page was left with uncaught errors:\n${detail}`).toBe(0)
}
