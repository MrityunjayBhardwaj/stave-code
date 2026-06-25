/**
 * useStripScale — adaptive, aspect-locked sizing for the Mixer console strips.
 *
 * The channel strips are a fixed pixel design (84 × ~STRIP_BASE_HEIGHT). On their
 * own they ignore the drawer: a tall Mixer drawer leaves the strips small with a
 * big empty band, a narrow one clips them. This hook scales every strip by ONE
 * uniform factor (`zoom`) derived from the band's height, so the strips grow and
 * shrink WITH the drawer while keeping their exact aspect ratio (a uniform zoom,
 * never a stretch — the faders just get bigger/easier to grab). Width follows the
 * locked aspect, so the strips also fill more width as they grow; leftover space
 * on a wide drawer stays to the right (aspect is retained, design choice).
 *
 * The scale is clamped to [MIN_SCALE, MAX_SCALE]: never smaller than the original
 * 1× design, never absurdly large on a huge drawer. The math is a pure function
 * (`stripScaleFor`) so it unit-tests directly; the hook just feeds it the band's
 * live height via a ResizeObserver.
 */
import * as React from 'react'

/** the strip's natural (1×) content height in px — header + pan + fader + gain
 *  + gaps + padding. The reference at which the zoom factor is exactly 1. */
export const STRIP_BASE_HEIGHT = 190
/** the band's vertical padding (top + bottom), excluded from the usable height. */
const BAND_V_PADDING = 16
const MIN_SCALE = 1
const MAX_SCALE = 2.4

/**
 * The aspect-locked zoom factor for a given band height (px). Below the base
 * height the strips stay 1× (they'd clip rather than shrink the faders to
 * nothing); above it they grow with the drawer, capped at MAX_SCALE. Rounded to
 * 2dp so a resize drag doesn't thrash React with sub-pixel updates.
 */
export function stripScaleFor(bandHeightPx: number): number {
  const u = (bandHeightPx - BAND_V_PADDING) / STRIP_BASE_HEIGHT
  if (!Number.isFinite(u)) return MIN_SCALE
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(u * 100) / 100))
}

/**
 * Observe the band's height → the aspect-locked strip zoom factor, plus the
 * CALLBACK REF to attach to the band. A callback ref (not an object ref + effect)
 * is required because the band unmounts/remounts: the Mixer console renders a
 * standby fallback when the document has no strips, so a one-shot effect would
 * run while the band is absent, bind nothing, and never re-bind when it appears.
 * The callback fires on every attach/detach, so the ResizeObserver always tracks
 * the live band and re-measures the instant it mounts. Returns MIN_SCALE until
 * measured (and where ResizeObserver is absent, e.g. SSR/tests) → no behaviour
 * change at the original size.
 */
export function useStripScale(): {
  scale: number
  bandRef: (el: HTMLElement | null) => void
} {
  const [scale, setScale] = React.useState(MIN_SCALE)
  const roRef = React.useRef<ResizeObserver | null>(null)
  const bandRef = React.useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setScale(stripScaleFor(el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    roRef.current = ro
  }, [])
  return { scale, bandRef }
}
