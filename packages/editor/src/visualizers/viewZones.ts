import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { resolveDescriptor } from './resolveDescriptor'
import { BufferedScheduler } from '../engine/BufferedScheduler'
import { VizPresetStore, type CropRegion, type VizPreset } from './vizPreset'

export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

export interface VizZoneActions {
  onEdit?: (vizId: string) => void
  onCrop?: (vizId: string, presetId: string | null) => void
}

/** Default native canvas dimensions for sketches that don't override them.
 *  2:1 aspect (1200×600) — good generic default for most viz types. */
const DEFAULT_NATIVE: { w: number; h: number } = { w: 1200, h: 600 }
/** Hard cap on inline zone height to prevent runaway tall viz. */
const MAX_ZONE_HEIGHT = 600
/** Minimum zone height so short crops are still visible. */
const MIN_ZONE_HEIGHT = 80

function nativeSizeFor(preset: VizPreset | null): { w: number; h: number } {
  const s = preset?.nativeSize
  if (s && s.w > 0 && s.h > 0) return { w: s.w, h: s.h }
  return DEFAULT_NATIVE
}

/**
 * Compute the inline zone height + canvas transform for a given content
 * width + native canvas size + crop region.
 *
 * Uniform scale preserves aspect ratio. Zone height is derived from the
 * crop's native-pixel aspect so the displayed viz matches exactly what
 * the user picked in the crop popup (WYSIWYG).
 */
function computeLayout(
  contentW: number,
  native: { w: number; h: number },
  crop: CropRegion,
): { zoneH: number; scale: number; tx: number; ty: number } {
  const cropW = Math.max(0.01, crop.w)
  const cropH = Math.max(0.01, crop.h)
  // scale so the cropped region's width fills contentW
  const scale = contentW / (cropW * native.w)
  let zoneH = cropH * native.h * scale
  // Clamp to reasonable bounds
  if (zoneH > MAX_ZONE_HEIGHT) {
    const clamped = MAX_ZONE_HEIGHT / (cropH * native.h)
    return {
      zoneH: MAX_ZONE_HEIGHT,
      scale: clamped,
      tx: -crop.x * native.w * clamped,
      ty: -crop.y * native.h * clamped,
    }
  }
  if (zoneH < MIN_ZONE_HEIGHT) zoneH = MIN_ZONE_HEIGHT
  return {
    zoneH,
    scale,
    tx: -crop.x * native.w * scale,
    ty: -crop.y * native.h * scale,
  }
}

/** Apply the computed transform to the canvas inside the container. */
function applyLayout(
  container: HTMLElement,
  canvas: HTMLElement | null,
  layout: { scale: number; tx: number; ty: number },
): void {
  container.style.height = `${layout.zoneH ?? container.style.height}`
  // The canvas (or its wrapper) gets the transform. We wrap the canvas
  // in a positioned div so we can transform it without fighting any
  // inline styles the renderer might set.
  let wrapper = container.querySelector<HTMLElement>('[data-viz-canvas-wrap]')
  if (!wrapper && canvas) {
    wrapper = document.createElement('div')
    wrapper.setAttribute('data-viz-canvas-wrap', '')
    wrapper.style.cssText = `position:absolute;top:0;left:0;transform-origin:0 0;`
    canvas.parentElement?.insertBefore(wrapper, canvas)
    wrapper.appendChild(canvas)
  }
  if (wrapper) {
    wrapper.style.transform = `translate(${layout.tx}px, ${layout.ty}px) scale(${layout.scale})`
  }
}

function createFloatingActionBar(editorDom: HTMLElement): HTMLElement {
  const bar = document.createElement('div')
  bar.setAttribute('data-viz-actions', '')
  bar.style.cssText = `
    position:absolute;z-index:100;
    display:flex;gap:4px;
    opacity:0;transition:opacity 0.15s;
    pointer-events:none;
  `
  const btnCss = `
    background:var(--bg-elevated,#1e1e38);
    border:1px solid var(--border-strong,#3a3a5a);
    border-radius:3px;padding:2px 6px;
    color:var(--text-primary,#e8e8f0);
    font-size:11px;cursor:pointer;
    font-family:system-ui,sans-serif;
    pointer-events:auto;
  `
  const blockMonaco = (el: HTMLElement) => {
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('mouseup', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
    el.addEventListener('pointerup', (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
  }
  const editBtn = document.createElement('button')
  editBtn.textContent = '\u270E'
  editBtn.title = 'Edit viz file'
  editBtn.style.cssText = btnCss
  blockMonaco(editBtn)
  bar.appendChild(editBtn)
  const cropBtn = document.createElement('button')
  cropBtn.textContent = '\u2702'
  cropBtn.title = 'Crop inline region'
  cropBtn.style.cssText = btnCss
  blockMonaco(cropBtn)
  bar.appendChild(cropBtn)
  const guard = editorDom.querySelector('.overflow-guard') || editorDom
  guard.appendChild(bar)
  return bar
}

interface ZoneEntry {
  zoneId: string
  afterLine: number
  container: HTMLElement
  canvas: HTMLCanvasElement | null
  vizId: string
  presetId: string | null
  native: { w: number; h: number }
  crop: CropRegion
}

const FULL_CROP: CropRegion = { x: 0, y: 0, w: 1, h: 1 }

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

  const renderers: VizRenderer[] = []
  const bufferedSchedulers: BufferedScheduler[] = []
  const zoneEntries: ZoneEntry[] = []

  const audioCtx = components.audio?.audioCtx

  editor.changeViewZones((accessor) => {
    for (const [trackKey, { vizId, afterLine }] of vizRequests) {
      const descriptor = resolveDescriptor(vizId, vizDescriptors)
      if (!descriptor) {
        console.warn(`[stave] Unknown viz "${vizId}". Available: ${vizDescriptors.map(d => d.id).join(', ')}`)
        continue
      }

      let trackScheduler = components.queryable?.trackSchedulers.get(trackKey) ?? null
      const trackStream = components.inlineViz?.trackStreams?.get(trackKey)
      if (!trackScheduler && trackStream && audioCtx) {
        const buffered = new BufferedScheduler(trackStream, audioCtx)
        bufferedSchedulers.push(buffered)
        trackScheduler = buffered
      }

      const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey)
      const zoneAudio = trackAnalyser && audioCtx
        ? { analyser: trackAnalyser, audioCtx, trackAnalysers: components.audio?.trackAnalysers }
        : (trackStream ? undefined : components.audio)

      const zoneComponents: Partial<EngineComponents> = {
        ...components,
        ...(trackStream ? { streaming: { hapStream: trackStream } } : {}),
        audio: zoneAudio,
        queryable: {
          scheduler: trackScheduler,
          trackSchedulers: components.queryable?.trackSchedulers ?? new Map(),
        },
      }

      // Start with default native + full crop; refined async once preset loads.
      const native = DEFAULT_NATIVE
      const crop = FULL_CROP
      const contentW = editor.getLayoutInfo().contentWidth || 400
      const layout = computeLayout(contentW, native, crop)

      const container = document.createElement('div')
      container.setAttribute('data-viz-zone', '')
      container.style.cssText = `overflow:hidden;height:${layout.zoneH}px;position:relative;`

      const zoneId = accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: layout.zoneH,
        domNode: container,
        suppressMouseDown: true,
      })

      // Mount the renderer at native size. Canvas is created by the
      // renderer as a direct child of container.
      const renderer = typeof descriptor.factory === 'function'
        ? descriptor.factory()
        : descriptor.factory as VizRenderer
      try {
        renderer.mount(container, zoneComponents, { w: native.w, h: native.h }, console.error)
      } catch (e) {
        console.error('[stave] viz mount failed:', e)
      }
      renderers.push(renderer)

      // The renderer may create the canvas asynchronously (p5 defers
      // to rAF). Apply layout now if the canvas is already present,
      // and again on next rAF to catch async p5 mounts.
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')
      applyLayout(container, canvas, layout)
      requestAnimationFrame(() => {
        applyLayout(container, container.querySelector('canvas'), layout)
      })

      zoneEntries.push({
        zoneId, afterLine, container, canvas, vizId, presetId: null, native, crop,
      })
    }
  })

  // ── Async: load presets and refine native size + crop ──
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '')
  void (async () => {
    try {
      const presets = await VizPresetStore.getAll()
      editor.changeViewZones((accessor) => {
        for (const entry of zoneEntries) {
          const normViz = normalize(entry.vizId)
          const preset = presets.find(p => normalize(p.name) === normViz) ?? null
          if (!preset) continue
          entry.presetId = preset.id
          entry.native = nativeSizeFor(preset)
          entry.crop = preset.cropRegion ?? FULL_CROP
          const contentW = editor.getLayoutInfo().contentWidth || 400
          const layout = computeLayout(contentW, entry.native, entry.crop)
          entry.container.style.height = `${layout.zoneH}px`
          // Update Monaco's view zone height so the editor reflows.
          accessor.layoutZone(entry.zoneId)
          applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
        }
      })
      // After heights change, Monaco repositions zones — ensure the
      // canvas still fills each container via transform reapplication.
      for (const entry of zoneEntries) {
        const contentW = editor.getLayoutInfo().contentWidth || 400
        const layout = computeLayout(contentW, entry.native, entry.crop)
        entry.container.style.height = `${layout.zoneH}px`
        applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
      }
    } catch { /* ignore */ }
  })()

  // ── Editor layout changes: recompute transform + zone height ──
  const layoutChangeDisposable = editor.onDidLayoutChange?.(() => {
    editor.changeViewZones((accessor) => {
      for (const entry of zoneEntries) {
        const contentW = editor.getLayoutInfo().contentWidth || 400
        const layout = computeLayout(contentW, entry.native, entry.crop)
        entry.container.style.height = `${layout.zoneH}px`
        accessor.layoutZone(entry.zoneId)
        applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
      }
    })
  })

  // ── Floating action bar (unchanged from before) ──
  const editorDom = editor.getDomNode?.()
  let floatingBar: HTMLElement | null = null
  let mouseMoveDisposable: { dispose(): void } | null = null

  if (editorDom && actions && (actions.onEdit || actions.onCrop)) {
    floatingBar = createFloatingActionBar(editorDom)
    const editBtn = floatingBar.children[0] as HTMLElement
    const cropBtn = floatingBar.children[1] as HTMLElement

    editBtn.onclick = (e) => {
      e.stopPropagation()
      const vizId = floatingBar?.getAttribute('data-viz-id')
      if (vizId && actions.onEdit) actions.onEdit(vizId)
    }
    cropBtn.onclick = (e) => {
      e.stopPropagation()
      const vizId = floatingBar?.getAttribute('data-viz-id')
      const presetId = floatingBar?.getAttribute('data-preset-id') || null
      if (vizId && actions.onCrop) actions.onCrop(vizId, presetId)
    }

    mouseMoveDisposable = editor.onMouseMove?.((ev: Monaco.editor.IEditorMouseEvent) => {
      const mouseY = ev.event.posy
      const mouseX = ev.event.posx
      let found: ZoneEntry | null = null
      for (const entry of zoneEntries) {
        const rect = entry.container.getBoundingClientRect()
        if (mouseY >= rect.top && mouseY <= rect.bottom && mouseX >= rect.left && mouseX <= rect.right) {
          found = entry
          break
        }
      }
      if (found && floatingBar) {
        const rect = found.container.getBoundingClientRect()
        const guardRect = (editorDom.querySelector('.overflow-guard') || editorDom).getBoundingClientRect()
        floatingBar.style.top = `${rect.top - guardRect.top + 4}px`
        floatingBar.style.left = `${rect.right - guardRect.left - 68}px`
        floatingBar.style.opacity = '1'
        floatingBar.style.pointerEvents = 'auto'
        floatingBar.setAttribute('data-viz-id', found.vizId)
        floatingBar.setAttribute('data-preset-id', found.presetId || '')
      } else if (floatingBar) {
        floatingBar.style.opacity = '0'
        floatingBar.style.pointerEvents = 'none'
      }
    }) ?? null
  }

  const mouseLeaveHandler = () => {
    if (floatingBar) {
      floatingBar.style.opacity = '0'
      floatingBar.style.pointerEvents = 'none'
    }
  }
  editorDom?.addEventListener('mouseleave', mouseLeaveHandler)

  return {
    cleanup() {
      mouseMoveDisposable?.dispose?.()
      layoutChangeDisposable?.dispose?.()
      editorDom?.removeEventListener('mouseleave', mouseLeaveHandler)
      floatingBar?.remove()
      renderers.forEach(r => r.destroy())
      bufferedSchedulers.forEach(s => s.dispose())
      editor.changeViewZones((accessor) => {
        zoneEntries.forEach(e => accessor.removeZone(e.zoneId))
      })
    },
    pause() { renderers.forEach(r => r.pause()) },
    resume() { renderers.forEach(r => r.resume()) },
  }
}
