import { useEffect, useRef, useCallback } from 'react'
import type { VizDescriptor } from '../types'
import type { HapStream } from '../../engine/HapStream'
import type { PatternScheduler } from '../types'
import { applyTheme } from '../../theme/tokens'

interface PopoutPreviewProps {
  descriptor: VizDescriptor | null
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  onClose: () => void
  theme?: 'dark' | 'light'
}

/**
 * Opens a pop-out browser window with the viz canvas.
 * Audio data is pumped via postMessage since the pop-out window
 * doesn't share the AudioContext.
 */
export function usePopoutPreview({
  descriptor,
  hapStream,
  analyser,
  scheduler,
  onClose,
  theme = 'dark',
}: PopoutPreviewProps) {
  const windowRef = useRef<Window | null>(null)
  const rendererRef = useRef<ReturnType<VizDescriptor['factory']> | null>(null)
  const rafRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    rendererRef.current?.destroy()
    rendererRef.current = null
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close()
    }
    windowRef.current = null
  }, [])

  useEffect(() => {
    if (!descriptor) {
      cleanup()
      return
    }

    // Open pop-out window
    const popup = window.open(
      '',
      `viz-popout-${descriptor.id}`,
      'width=800,height=600,menubar=no,toolbar=no,location=no,status=no',
    )
    if (!popup) {
      console.warn('Pop-out blocked by browser — allow popups for this site')
      onClose()
      return
    }

    windowRef.current = popup

    // Set up the popup document
    popup.document.title = `Viz: ${descriptor.label}`
    popup.document.body.style.margin = '0'
    popup.document.body.style.padding = '0'
    popup.document.body.style.overflow = 'hidden'

    const container = popup.document.createElement('div')
    container.style.width = '100vw'
    container.style.height = '100vh'
    container.style.position = 'relative'
    popup.document.body.appendChild(container)

    // Apply theme via CSS custom properties (S3 / PV6 / P6).
    // Replaces the hardcoded '#090912' background. The theme tokens set
    // --background on the container; the popup body inherits via the
    // container's background style binding.
    applyTheme(container, theme)
    popup.document.body.style.background = container.style.getPropertyValue('--background') || '#090912'

    // Mount the renderer
    try {
      const renderer = descriptor.factory()
      rendererRef.current = renderer

      const components: any = {}
      if (hapStream) components.streaming = { hapStream }
      if (analyser) components.audio = { analyser, audioCtx: analyser.context }
      if (scheduler) components.queryable = { scheduler }

      renderer.mount(
        container as any,
        components,
        { w: 800, h: 600 },
        (err) => console.error('Viz popout error:', err),
      )

      // Handle resize
      const onResize = () => {
        renderer.resize(popup.innerWidth, popup.innerHeight)
      }
      popup.addEventListener('resize', onResize)
    } catch (e) {
      console.error('Failed to mount viz in popout:', e)
    }

    // Detect popup close
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed)
        cleanup()
        onClose()
      }
    }, 500)

    return () => {
      clearInterval(checkClosed)
      cleanup()
    }
  }, [descriptor?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update renderer with fresh audio data
  useEffect(() => {
    if (!rendererRef.current) return
    const components: any = {}
    if (hapStream) components.streaming = { hapStream }
    if (analyser) components.audio = { analyser, audioCtx: analyser.context }
    if (scheduler) components.queryable = { scheduler }
    rendererRef.current.update(components)
  }, [hapStream, analyser, scheduler])

  return { cleanup }
}
