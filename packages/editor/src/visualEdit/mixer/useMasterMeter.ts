/**
 * useMasterMeter — the live level of the whole mix, for the master strip (S5).
 *
 * Where `useTrackMeters` reads each track's OWN haps (per-track, pre-effects),
 * the MASTER meter reads the engine's master `AnalyserNode` — a read-only side-
 * tap on the output bus (`StrudelEngine.ts:470`, `destinationGain.connect(
 * analyser)`; audio flows on to the destination unchanged → no routing mutation,
 * V-mixer-3 / no-orbit-hack honored). That makes it the true POST-mix, POST-
 * effects output level (reverb tails, the sum of every track), which is exactly
 * what a master meter should show and what the per-track hap meters can't.
 *
 * It is exposed on the bus payload as `AudioPayload.analyser`
 * (`LiveCodingRuntime.ts:354`). One capped RAF loop samples
 * `getByteTimeDomainData` → `rmsFromTimeDomain` → meter ballistics, painted
 * imperatively (no per-frame React render — same discipline as the track
 * meters). Pinned to the ACTIVE file's program (not the bus "default" publisher,
 * which can be a preview), pauses while the tab is hidden.
 */
import * as React from 'react'

import { workspaceAudioBus } from '../../workspace/WorkspaceAudioBus'
import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'
import type { AudioPayload } from '../../workspace/types'
import { gainToFaderPos } from './faderTaper'
import { advanceMeter, rmsFromTimeDomain, ZERO_METER, type MeterState } from './meterMath'
import type { MeterEls } from './useTrackMeters'

/** what the master strip hands the hook: register its fill + peak elements. */
export interface MasterMeterController {
  register: (els: MeterEls | null) => void
}

/** lowest frame gap billed, so a 120 Hz display still caps ~60 fps. */
const MIN_FRAME_MS = 1000 / 60

function analyserOf(payload: AudioPayload | null): AnalyserNode | null {
  return payload?.analyser ?? null
}

/** bar colour by level fraction on the shared fader scale: green → yellow → red. */
function levelColor(frac: number): string {
  if (frac >= 0.9) return 'var(--meter-red, #ff5a52)'
  if (frac >= 0.72) return 'var(--meter-yellow, #ffcc4d)'
  return 'var(--meter-green, #44d07b)'
}

export function useMasterMeter(): MasterMeterController {
  const elsRef = React.useRef<MeterEls | null>(null)
  const stateRef = React.useRef<MeterState>(ZERO_METER)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  // ArrayBuffer-backed (not ArrayBufferLike) so it satisfies
  // `getByteTimeDomainData`'s buffer parameter type (TS lib 5.7+).
  const bufRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const lastTsRef = React.useRef<number>(0)

  // Pin to the active file's program, like the track meters (not the bus default).
  const [fileId, setFileId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => {
    setFileId(getActiveFileId())
    return onActiveEditorChange(() => setFileId(getActiveFileId()))
  }, [])

  const register = React.useCallback((els: MeterEls | null): void => {
    elsRef.current = els
    if (!els) stateRef.current = ZERO_METER
  }, [])

  React.useEffect(() => {
    const unsub = fileId
      ? workspaceAudioBus.subscribe({ kind: 'file', fileId }, (payload) => {
          analyserRef.current = analyserOf(payload)
        })
      : (() => {
          analyserRef.current = null
          return () => {}
        })()

    const paintDark = (els: MeterEls): void => {
      els.fill.style.height = '0%'
      els.peak.style.bottom = '0%'
      els.peak.style.opacity = '0'
    }

    const frame = (ts: number): void => {
      rafRef.current = requestAnimationFrame(frame)
      const last = lastTsRef.current
      const dt = last === 0 ? MIN_FRAME_MS : ts - last
      if (dt < MIN_FRAME_MS) return
      lastTsRef.current = ts

      const els = elsRef.current
      if (!els) return
      const analyser = analyserRef.current
      if (!analyser) {
        paintDark(els)
        stateRef.current = ZERO_METER
        return
      }
      // Reuse one buffer sized to the analyser's bin count.
      let buf = bufRef.current
      if (!buf || buf.length !== analyser.fftSize) {
        buf = new Uint8Array(analyser.fftSize)
        bufRef.current = buf
      }
      try {
        analyser.getByteTimeDomainData(buf)
      } catch {
        paintDark(els)
        return
      }
      const instant = rmsFromTimeDomain(buf)
      const next = advanceMeter(stateRef.current, instant, dt)
      stateRef.current = next

      // Share the track meters' dB taper so master and channels read one scale.
      const lvl = gainToFaderPos(next.rms)
      const pk = gainToFaderPos(next.peak)
      els.fill.style.height = `${lvl * 100}%`
      els.fill.style.background = levelColor(lvl)
      els.peak.style.bottom = `${pk * 100}%`
      els.peak.style.opacity = next.peak > 0.0005 ? '1' : '0'
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
      analyserRef.current = null
      stateRef.current = ZERO_METER
    }
  }, [fileId])

  return React.useMemo(() => ({ register }), [register])
}
