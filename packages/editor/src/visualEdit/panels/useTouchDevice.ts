/**
 * Is this a phone or a tablet — a device whose MAIN pointer is a finger (#1990)?
 *
 * Asked of the browser (`(pointer: coarse)`), not guessed from the window's width or
 * the user agent: a narrow desktop window is still a desktop, and a laptop with a
 * touch screen still has a mouse as its main pointer. Follows a change while the page
 * is open (a tablet gaining or losing a trackpad).
 */
import * as React from 'react'

export const TOUCH_DEVICE_QUERY = '(pointer: coarse)'

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(TOUCH_DEVICE_QUERY) : null
}

export function useTouchDevice(): boolean {
  return React.useSyncExternalStore(
    (changed) => {
      const mql = query()
      if (!mql) return () => undefined
      mql.addEventListener('change', changed)
      return () => mql.removeEventListener('change', changed)
    },
    () => query()?.matches ?? false,
    () => false,
  )
}
