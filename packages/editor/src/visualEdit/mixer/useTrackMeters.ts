/**
 * useTrackMeters — the live-metering side of the channel-strip Mixer.
 *
 * It subscribes to the `WorkspaceAudioBus` for the playing program's
 * `engineComponents.queryable.trackSchedulers` (`Map<captureId, PatternScheduler>`),
 * and runs ONE capped `requestAnimationFrame` loop that, for every registered
 * strip, queries THAT track's own haps at the transport `now`, takes the loudest
 * `gain × velocity` as the instantaneous level (`meterMath`), runs it through the
 * meter ballistics, and paints the bar IMPERATIVELY.
 *
 * Why per-track haps and not the per-track analyser: observation (the swap test)
 * showed every `trackAnalyser` taps the SHARED orbit-1 bus unless a track is
 * `.viz`/`.orbit`-isolated, so analyser meters would all read the master mix, not
 * the track. Isolating each track's orbit just to meter it would be mutating
 * audio routing for observation — exactly what V-mixer-3 / `feedback_no_orbit_hack`
 * forbid. The per-track haps are keyed by `captureId`, are genuinely per-track,
 * need NO routing change, and reflect the `.gain` the fader writes — so fader and
 * meter form one coherent loop.
 *
 * Painting the DOM directly (not through React state) is deliberate: a level
 * meter updates ~60×/s, and routing that through `setState` would re-render the
 * whole strip row — and its fader/pan drag handlers — every frame. Each
 * `StripMeter` instead registers its fill + peak elements via `register`, and
 * the loop writes their geometry. React owns structure; the RAF owns paint.
 *
 * No scheduler for a captureId → the bar paints dark (a muted / not-yet-evaluated
 * track — correct, design §6.2). The loop only runs while at least one meter is
 * registered and the document is visible; it stops on unmount, on
 * `document.hidden`, and when the strip row unmounts (panel closed). Pure level
 * maths live in `meterMath.ts`; this file is the I/O the unit tests deliberately
 * don't cover (the test-split discipline).
 */
import * as React from 'react'

import { workspaceAudioBus } from '../../workspace/WorkspaceAudioBus'
import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'
import type { AudioPayload } from '../../workspace/types'
import type { PatternScheduler } from '../../visualizers/types'
import { gainToFaderPos } from './faderTaper'
import {
  advanceMeter,
  levelFromActiveHaps,
  ZERO_METER,
  type MeterHap,
  type MeterState,
} from './meterMath'

/** the two elements a strip's meter paints each frame. */
export interface MeterEls {
  /** the level fill, anchored at the bottom — height set 0..100% */
  fill: HTMLElement
  /** the peak tick — `bottom` set 0..100% */
  peak: HTMLElement
}

/** what the hook hands the strip row: register a meter's DOM, get live paint. */
export interface MeterController {
  /** register (or, with `null`, unregister) a strip's meter elements by captureId */
  register: (captureId: string, els: MeterEls | null) => void
}

/** read the per-track scheduler map out of a bus payload. */
function schedulersOf(payload: AudioPayload | null): Map<string, PatternScheduler> | null {
  if (!payload) return null
  return payload.engineComponents?.queryable?.trackSchedulers ?? null
}

/** bar colour by level fraction on the shared fader scale: green → yellow → red. */
function levelColor(frac: number): string {
  if (frac >= 0.9) return 'var(--meter-red, #ff5a52)'
  if (frac >= 0.72) return 'var(--meter-yellow, #ffcc4d)'
  return 'var(--meter-green, #44d07b)'
}

/** lowest frame gap we bill the ballistics for, so a 120 Hz display still caps ~60 fps. */
const MIN_FRAME_MS = 1000 / 60

/** cycles of look-ahead per query — wide enough to catch the hap active at `now`. */
const QUERY_WINDOW_CYCLES = 0.01

export function useTrackMeters(): MeterController {
  // captureId → its registered DOM elements.
  const elsRef = React.useRef<Map<string, MeterEls>>(new Map())
  // captureId → running ballistics state, carried across frames.
  const stateRef = React.useRef<Map<string, MeterState>>(new Map())
  // the live per-track scheduler map from the bus (read fresh each frame).
  const schedulersRef = React.useRef<Map<string, PatternScheduler> | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const lastTsRef = React.useRef<number>(0)

  // The file the active editor shows — the strips come from it, so the meters
  // must follow the SAME program. We pin the bus to this file rather than its
  // "default" (most-recent) publisher, which can be a chord/sample/drum preview.
  const [fileId, setFileId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => {
    setFileId(getActiveFileId())
    return onActiveEditorChange(() => setFileId(getActiveFileId()))
  }, [])

  const register = React.useCallback((captureId: string, els: MeterEls | null): void => {
    if (els) elsRef.current.set(captureId, els)
    else {
      elsRef.current.delete(captureId)
      stateRef.current.delete(captureId)
    }
  }, [])

  React.useEffect(() => {
    // Pin to the active file's program (not the bus default). When that file
    // isn't playing, no payload → schedulers null → dark meters (correct).
    const unsub = fileId
      ? workspaceAudioBus.subscribe({ kind: 'file', fileId }, (payload) => {
          schedulersRef.current = schedulersOf(payload)
        })
      : (() => {
          schedulersRef.current = null
          return () => {}
        })()

    const paintDark = (els: MeterEls): void => {
      els.fill.style.height = '0%'
      els.peak.style.bottom = '0%'
      els.peak.style.opacity = '0'
    }

    /** the loudest gain×velocity active on a track right now, or 0 if none/idle. */
    const instantLevel = (sched: PatternScheduler): number => {
      let now: number
      try {
        now = sched.now()
      } catch {
        return 0
      }
      if (!Number.isFinite(now)) return 0
      let haps: MeterHap[]
      try {
        haps = sched.query(now, now + QUERY_WINDOW_CYCLES) as unknown as MeterHap[]
      } catch {
        return 0
      }
      return levelFromActiveHaps(haps, now)
    }

    const frame = (ts: number): void => {
      rafRef.current = requestAnimationFrame(frame)
      const last = lastTsRef.current
      const dt = last === 0 ? MIN_FRAME_MS : ts - last
      if (dt < MIN_FRAME_MS) return // 60 fps cap (R2): skip extra frames on fast displays
      lastTsRef.current = ts

      const schedulers = schedulersRef.current
      for (const [captureId, els] of elsRef.current) {
        const sched = schedulers?.get(captureId)
        if (!sched) {
          paintDark(els)
          stateRef.current.delete(captureId)
          continue
        }
        const instant = instantLevel(sched)
        const prev = stateRef.current.get(captureId) ?? ZERO_METER
        const next = advanceMeter(prev, instant, dt)
        stateRef.current.set(captureId, next)

        // Share the fader's dB taper so the meter and fader read on one scale.
        const lvl = gainToFaderPos(next.rms)
        const pk = gainToFaderPos(next.peak)
        els.fill.style.height = `${lvl * 100}%`
        els.fill.style.background = levelColor(lvl)
        els.peak.style.bottom = `${pk * 100}%`
        els.peak.style.opacity = next.peak > 0.0005 ? '1' : '0'
      }
    }

    const start = (): void => {
      if (rafRef.current === null) {
        lastTsRef.current = 0
        rafRef.current = requestAnimationFrame(frame)
      }
    }
    const stop = (): void => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }

    // Pause the loop while the tab is hidden (R2) — nothing to observe, and the
    // browser throttles RAF there anyway; resume on return.
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
      unsub()
      schedulersRef.current = null
      stateRef.current.clear()
    }
  }, [fileId])

  return React.useMemo(() => ({ register }), [register])
}
