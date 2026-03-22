import type * as Monaco from 'monaco-editor'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { VizRefs } from './types'
import { P5VizRenderer } from './renderers/P5VizRenderer'
import { PianorollSketch } from './sketches/PianorollSketch'
import { mountVizRenderer } from './mountVizRenderer'

const VIEW_ZONE_HEIGHT = 120

/**
 * Imperatively adds inline pianoroll view zones below every $: line in the Monaco editor.
 *
 * Named `viewZones.ts` (not `useViewZones.ts`) because this exports a plain imperative
 * function, NOT a React hook.
 *
 * Returns a cleanup function that removes all zones and destroys renderer instances.
 */
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null
): () => void {
  const model = editor.getModel()
  if (!model) return () => {}

  const code = model.getValue()
  const lines = code.split('\n')
  const zoneIds: string[] = []
  const cleanups: (() => void)[] = []

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;height:120px;'

      const hapStreamRef = { current: hapStream } as RefObject<HapStream | null>
      const analyserRef = { current: analyser } as RefObject<AnalyserNode | null>
      const schedulerRef = { current: null } as RefObject<null>

      const zoneId = accessor.addZone({
        afterLineNumber: i + 1,
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
      const { renderer, disconnect } = mountVizRenderer(
        container,
        () => new P5VizRenderer(PianorollSketch),
        refs,
        { w: container.clientWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )

      cleanups.push(() => {
        disconnect()
        renderer.destroy()
      })
    })
  })

  return () => {
    cleanups.forEach((fn) => fn())
    editor.changeViewZones((accessor) => {
      zoneIds.forEach((id) => accessor.removeZone(id))
    })
  }
}
