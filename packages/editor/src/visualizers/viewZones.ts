import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { mountVizRenderer } from './mountVizRenderer'
import { resolveDescriptor } from './resolveDescriptor'
import { getVizConfig } from './vizConfig'
import { BufferedScheduler } from '../engine/BufferedScheduler'
import { getNamedViz } from './namedVizRegistry'
import { VizPresetStore, type CropRegion } from './vizPreset'

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
 * Action callbacks for inline viz zone icons.
 */
export interface VizZoneActions {
  /** Open the viz file in the editor (navigate to it). */
  onEdit?: (vizId: string) => void
  /** Open the crop popup for a viz. Receives the viz id and the
   *  preset id (for persistence). */
  onCrop?: (vizId: string, presetId: string | null) => void
}

/**
 * Apply a CropRegion to a container by wrapping its child canvas in a
 * scaled viewport. The crop coordinates are fractional 0–1 relative to
 * the full canvas. We use CSS transform + clip-path on a wrapper div.
 */
function applyCropRegion(
  container: HTMLElement,
  crop: CropRegion,
  zoneHeight: number,
  contentWidth: number,
): void {
  // The canvas fills the container. We create a wrapper that clips and
  // scales so only the cropped region is visible, stretched to fill.
  const wrapper = container.querySelector<HTMLElement>('[data-viz-crop-wrapper]')
  if (wrapper) {
    // Already wrapped — update the transform
    const scaleX = 1 / crop.w
    const scaleY = 1 / crop.h
    const tx = -crop.x * contentWidth * scaleX
    const ty = -crop.y * zoneHeight * scaleY
    wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`
    wrapper.style.transformOrigin = '0 0'
    return
  }

  // First time — wrap all children in a crop wrapper
  const cropWrapper = document.createElement('div')
  cropWrapper.setAttribute('data-viz-crop-wrapper', '')
  cropWrapper.style.cssText = `
    position: absolute; inset: 0; overflow: hidden;
    transform-origin: 0 0;
  `
  const scaleX = 1 / crop.w
  const scaleY = 1 / crop.h
  const tx = -crop.x * contentWidth * scaleX
  const ty = -crop.y * zoneHeight * scaleY
  cropWrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`

  // Move existing children into the wrapper
  while (container.firstChild) {
    cropWrapper.appendChild(container.firstChild)
  }
  container.style.position = 'relative'
  container.appendChild(cropWrapper)
}

function createActionBar(
  vizId: string,
  presetId: string | null,
  actions: VizZoneActions,
): HTMLElement {
  const bar = document.createElement('div')
  bar.style.cssText = `
    position: absolute; top: 4px; right: 8px; z-index: 10;
    display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
    pointer-events: none;
  `

  const btnStyle = `
    background: var(--bg-elevated, #1e1e38);
    border: 1px solid var(--border-strong, #3a3a5a);
    border-radius: 3px; padding: 2px 6px;
    color: var(--text-primary, #e8e8f0);
    font-size: 11px; cursor: pointer;
    font-family: system-ui, sans-serif;
    pointer-events: auto;
  `

  if (actions.onEdit) {
    const editBtn = document.createElement('button')
    editBtn.textContent = '\u270E' // pencil
    editBtn.title = 'Edit viz file'
    editBtn.style.cssText = btnStyle
    editBtn.onclick = (e) => { e.stopPropagation(); actions.onEdit!(vizId) }
    bar.appendChild(editBtn)
  }

  if (actions.onCrop) {
    const cropBtn = document.createElement('button')
    cropBtn.textContent = '\u2702' // scissors/crop
    cropBtn.title = 'Crop inline region'
    cropBtn.style.cssText = btnStyle
    cropBtn.onclick = (e) => { e.stopPropagation(); actions.onCrop!(vizId, presetId) }
    bar.appendChild(cropBtn)
  }

  return bar
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
  actions?: VizZoneActions,
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
  const zoneHeight = getVizConfig().inlineZoneHeight

  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = resolveDescriptor(vizId, vizDescriptors)
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
      container.style.cssText = `overflow:hidden;height:${zoneHeight}px;position:relative;`

      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: zoneHeight,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const { renderer, disconnect } = mountVizRenderer(
        container,
        descriptor.factory,
        zoneComponents,
        { w: contentWidth || 400, h: zoneHeight },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)

      // Resolve the preset id for this viz (needed for crop persistence)
      const namedDescriptor = getNamedViz(vizId)
      // The preset id is typically `__bundled_<name>_<renderer>__` or a
      // user preset id. We look it up async and apply crop if present.
      const presetName = vizId
      void (async () => {
        try {
          const presets = await VizPresetStore.getAll()
          const preset = presets.find(p => p.name === presetName)
          if (preset?.cropRegion) {
            applyCropRegion(container, preset.cropRegion, zoneHeight, contentWidth || 400)
          }
          // Add action icons (show on hover)
          if (actions && (actions.onEdit || actions.onCrop)) {
            const bar = createActionBar(vizId, preset?.id ?? null, actions)
            container.appendChild(bar)
            container.addEventListener('mouseenter', () => { bar.style.opacity = '1' })
            container.addEventListener('mouseleave', () => { bar.style.opacity = '0' })
          }
        } catch {
          // Preset lookup failed — still add icons without preset id
          if (actions && (actions.onEdit || actions.onCrop)) {
            const bar = createActionBar(vizId, null, actions)
            container.appendChild(bar)
            container.addEventListener('mouseenter', () => { bar.style.opacity = '1' })
            container.addEventListener('mouseleave', () => { bar.style.opacity = '0' })
          }
        }
      })()
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
