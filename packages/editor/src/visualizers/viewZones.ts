import p5 from 'p5'
import type * as Monaco from 'monaco-editor'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import { PianorollSketch } from './sketches/PianorollSketch'

const VIEW_ZONE_HEIGHT = 120

/**
 * Imperatively adds inline pianoroll view zones below every $: line in the Monaco editor.
 *
 * Named `viewZones.ts` (not `useViewZones.ts`) because this exports a plain imperative
 * function, NOT a React hook. The `use*` prefix is reserved for hooks in this project.
 *
 * Returns a cleanup function that removes all zones and destroys p5 instances.
 * The caller (StrudelEditor.handlePlay) is responsible for calling the previous cleanup
 * before calling addInlineViewZones again after each evaluate().
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
  const p5Instances: p5[] = []

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;height:120px;'

      // Uses plain object refs (not React.useRef) since this is imperative, not a hook.
      const hapStreamRef = { current: hapStream } as RefObject<HapStream | null>
      const analyserRef = { current: analyser } as RefObject<AnalyserNode | null>

      const zoneId = accessor.addZone({
        afterLineNumber: i + 1,
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      // Create p5 pianoroll in the zone container.
      const sketch = PianorollSketch(hapStreamRef, analyserRef)
      const instance = new p5(sketch, container)
      p5Instances.push(instance)
    })
  })

  return () => {
    p5Instances.forEach((inst) => inst.remove())
    editor.changeViewZones((accessor) => {
      zoneIds.forEach((id) => accessor.removeZone(id))
    })
  }
}
