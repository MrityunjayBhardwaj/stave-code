import type * as Monaco from 'monaco-editor'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { VizRefs, PatternScheduler, VizRenderer, VizDescriptor } from './types'
import { mountVizRenderer } from './mountVizRenderer'

const VIEW_ZONE_HEIGHT = 120

/**
 * Handle returned by addInlineViewZones.
 *
 * - cleanup(): removes all zones and destroys renderer instances. Call before re-adding zones.
 * - pause(): freezes all inline renderers at their last frame (zones stay visible).
 * - resume(): resumes rendering in all inline zones.
 */
export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

/**
 * Imperatively adds inline visualization view zones below $: lines that have called .viz().
 *
 * Named `viewZones.ts` (not `useViewZones.ts`) because this exports a plain imperative
 * function, NOT a React hook.
 *
 * Only patterns whose track key appears in vizRequests get a zone. The viz type is
 * resolved from vizDescriptors by name. Unknown viz names are logged to console.warn.
 *
 * Returns an InlineZoneHandle with cleanup/pause/resume for lifecycle management.
 *
 * Note: Zone div is NOT in DOM when mount() fires — initial width uses
 * editor.getLayoutInfo().contentWidth, not container.clientWidth.
 */
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>,
  vizRequests: Map<string, string>,
  vizDescriptors: VizDescriptor[],
): InlineZoneHandle {
  const model = editor.getModel()
  if (!model) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const code = model.getValue()
  const lines = code.split('\n')
  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []

  const contentWidth = editor.getLayoutInfo().contentWidth

  const hapStreamRef = { current: hapStream } as RefObject<HapStream | null>
  const analyserRef = { current: analyser } as RefObject<AnalyserNode | null>

  let anonIndex = 0

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const key = `$${anonIndex}`
      anonIndex++

      // Opt-in: only add zone if this pattern called .viz()
      const vizName = vizRequests.get(key)
      if (!vizName) return

      const descriptor = vizDescriptors.find(d => d.id === vizName)
      if (!descriptor) {
        console.warn(`[strucode] Unknown viz name: "${vizName}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        return
      }

      const trackScheduler = trackSchedulers.get(key) ?? null
      const schedulerRef = { current: trackScheduler } as RefObject<PatternScheduler | null>

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;height:120px;'

      // Find last line of this pattern block (continuation lines)
      let lastLineIdx = i
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next === '' || next.startsWith('$:') || next.startsWith('setcps')) break
        lastLineIdx = j
      }

      const zoneId = accessor.addZone({
        afterLineNumber: lastLineIdx + 1,  // 1-indexed, after last line of block
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,
        refs,
        { w: contentWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)
    })
  })

  return {
    cleanup() {
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      editor.changeViewZones((accessor) => {
        zoneIds.forEach(id => accessor.removeZone(id))
      })
    },
    pause() {
      renderers.forEach(r => r.pause())
    },
    resume() {
      renderers.forEach(r => r.resume())
    },
  }
}
