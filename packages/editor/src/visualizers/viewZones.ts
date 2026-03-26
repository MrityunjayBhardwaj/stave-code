import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { mountVizRenderer } from './mountVizRenderer'
import { BufferedScheduler } from '../engine/BufferedScheduler'

const VIEW_ZONE_HEIGHT = 150

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
 * Imperatively adds inline visualization view zones using engine-provided placement info.
 *
 * When the engine provides per-track HapStreams but no per-track queryable scheduler,
 * a BufferedScheduler is auto-created from the HapStream — making every viz type
 * available for every engine without engine-specific code.
 *
 * Returns an InlineZoneHandle with cleanup/pause/resume for lifecycle management.
 */
export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  components: Partial<EngineComponents>,
  vizDescriptors: VizDescriptor[],
): InlineZoneHandle {
  const vizRequests = components.inlineViz?.vizRequests
  if (!vizRequests || vizRequests.size === 0) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []
  const bufferedSchedulers: BufferedScheduler[] = []

  const contentWidth = editor.getLayoutInfo().contentWidth
  const audioCtx = components.audio?.audioCtx

  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = vizDescriptors.find(d => d.id === vizId)
      if (!descriptor) {
        console.warn(`[stave] Unknown viz "${vizId}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        continue
      }

      // Per-track queryable: use engine's if available, else auto-create from HapStream
      let trackScheduler = components.queryable?.trackSchedulers.get(trackKey) ?? null
      const trackStream = components.inlineViz?.trackStreams?.get(trackKey)

      if (!trackScheduler && trackStream && audioCtx) {
        // Auto-inject BufferedScheduler — engine-agnostic queryable from HapStream
        const buffered = new BufferedScheduler(trackStream, audioCtx)
        bufferedSchedulers.push(buffered)
        trackScheduler = buffered
      }

      // Per-track audio: use track-specific AnalyserNode when available,
      // otherwise strip global audio so sketches fall to event-driven path
      const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey)
      const zoneAudio = trackAnalyser && audioCtx
        ? { analyser: trackAnalyser, audioCtx, trackAnalysers: components.audio?.trackAnalysers }
        : (trackStream ? undefined : components.audio) // no track stream = global (Strudel)

      const zoneComponents: Partial<EngineComponents> = {
        ...components,
        ...(trackStream ? { streaming: { hapStream: trackStream } } : {}),
        audio: zoneAudio,
        queryable: {
          scheduler: trackScheduler,
          trackSchedulers: components.queryable?.trackSchedulers ?? new Map(),
        },
      }

      const container = document.createElement('div')
      container.style.cssText = `overflow:hidden;height:${VIEW_ZONE_HEIGHT}px;`

      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,
        zoneComponents,
        { w: contentWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)
    }
  })

  return {
    cleanup() {
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      bufferedSchedulers.forEach(s => s.dispose())
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
