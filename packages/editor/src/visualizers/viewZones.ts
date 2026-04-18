import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizRenderer, VizDescriptor } from './types'
import { resolveDescriptor } from './resolveDescriptor'
import { BufferedScheduler } from '../engine/BufferedScheduler'
import { VizPresetStore, type CropRegion, type VizPreset } from './vizPreset'
import { getZoneCropOverride, getZoneHeightOverride, setZoneHeightOverride, pruneZoneOverrides } from '../workspace/WorkspaceFile'

export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

export interface VizZoneActions {
  onEdit?: (vizId: string) => void
  /**
   * Fires when the user clicks the crop button on an inline zone.
   *
   * `trackKey` uniquely identifies THIS zone instance (same key the engine
   * uses for vizRequests / trackSchedulers / trackAnalysers). Required so
   * callers can save the crop as a per-instance override instead of
   * overwriting the shared VizPreset — otherwise two $: blocks using the
   * same preset would clobber each other's crop.
   */
  onCrop?: (vizId: string, presetId: string | null, trackKey: string) => void
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
 * Compute inline zone height + canvas transform.
 *
 * The cropped region fills the zone width — scale zooms so that
 * cropW × nativeW maps to contentW. Zone height follows the crop's
 * aspect. This is the original WYSIWYG model: what the user picks in
 * the crop popup is exactly what appears inline, edge-to-edge.
 *
 *   scale = contentW / (cropW × nativeW)
 *   zoneH = cropH × nativeH × scale
 *   tx    = -cropX × nativeW × scale
 *   ty    = -cropY × nativeH × scale
 */
function computeLayout(
  contentW: number,
  native: { w: number; h: number },
  crop: CropRegion,
): { zoneH: number; scale: number; tx: number; ty: number } {
  const cropW = Math.max(0.01, crop.w)
  const cropH = Math.max(0.01, crop.h)
  const scale = contentW / (cropW * native.w)
  let zoneH = cropH * native.h * scale
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

/**
 * Read the canvas's actual intrinsic dimensions. p5 sketches call
 * createCanvas(W, H) asynchronously after mount, often with dimensions that
 * differ from preset.nativeSize. The transform math MUST use the canvas's
 * actual size or the viz overflows the zone.
 *
 * Returns null if the canvas hasn't been created yet (first-frame pre-rAF).
 */
function readCanvasNative(container: HTMLElement): { w: number; h: number } | null {
  const canvas = container.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) return null
  // Use CSS display dimensions, NOT canvas.width/height (buffer size).
  // On HiDPI/Retina (devicePixelRatio > 1), p5 doubles the buffer for
  // sharp rendering: canvas.width = CSS_width × DPR. Transform math must
  // use the CSS size — buffer size halves the visual width on Retina.
  const w = canvas.offsetWidth | 0
  const h = canvas.offsetHeight | 0
  if (w <= 0 || h <= 0) return null
  return { w, h }
}

/** Apply the computed transform to the canvas inside the container.
 *  `zoneH` is optional — when provided, the container height is re-asserted
 *  in case Monaco reflowed it; otherwise the caller's pre-set height stands.
 */
function applyLayout(
  container: HTMLElement,
  canvas: HTMLElement | null,
  layout: { scale: number; tx: number; ty: number; zoneH?: number },
): void {
  if (typeof layout.zoneH === 'number') {
    container.style.height = `${layout.zoneH}px`
  }
  // The canvas (or its wrapper) gets the transform. We wrap the canvas
  // in a positioned div so we can transform it without fighting any
  // inline styles the renderer might set. The wrapper auto-sizes from the
  // canvas's intrinsic display size — do NOT override with explicit dims
  // or canvas CSS stretch, as that breaks the crop transform math.
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
    font-size:var(--inline-viz-action-size,11px);cursor:pointer;
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
  /** The zone descriptor object passed to addZone — kept so we can mutate
   *  heightInPx and have Monaco pick up the new value on layoutZone. */
  zoneDesc: { afterLineNumber: number; heightInPx: number; domNode: HTMLElement; suppressMouseDown: boolean }
  afterLine: number
  container: HTMLElement
  canvas: HTMLCanvasElement | null
  trackKey: string
  vizId: string
  presetId: string | null
  native: { w: number; h: number }
  crop: CropRegion
  /** Decoration on the `.viz("<vizId>")` source line — the anchor that
   *  survives edits to surrounding blocks. Null when the call couldn't be
   *  located at mount time; in that case the zone falls back to static
   *  positioning until the next evaluate. */
  vizDecoration: Monaco.editor.IEditorDecorationsCollection | null
}

const FULL_CROP: CropRegion = { x: 0, y: 0, w: 1, h: 1 }

/**
 * Mirror of StrudelEngine.buildVizRequestsWithLines' block scanner, run
 * against the live editor buffer. Returns an ordered array where index N
 * is the 1-indexed afterLine for the Nth `$:` block. Used to re-anchor
 * zones as the user edits between evaluations.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find the source line (1-indexed) of the `.viz("<vizId>")` call for the
 * block whose end matches `targetAfterLine`. Returns null if no such block
 * / call combination exists (happens e.g. after the user deletes the call
 * or renames the viz). Called once per zone at mount time to plant the
 * decoration anchor — live re-anchor then reads the decoration's current
 * line instead of re-running this search.
 */
function findVizCallLineForBlock(
  code: string,
  vizId: string,
  targetAfterLine: number,
): number | null {
  const lines = code.split('\n')
  const vizPattern = new RegExp(
    `\\.viz\\s*\\(\\s*["\`']${escapeRegex(vizId)}["\`']\\s*\\)`,
  )
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('$:')) continue
    let blockEnd = i
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (next.startsWith('$:') || next.startsWith('setcps')) break
      if (next !== '' && !next.startsWith('//')) blockEnd = j
    }
    if (blockEnd + 1 !== targetAfterLine) continue
    for (let k = i; k <= blockEnd; k++) {
      if (vizPattern.test(lines[k])) return k + 1
    }
  }
  return null
}

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  components: Partial<EngineComponents>,
  vizDescriptors: VizDescriptor[],
  actions?: VizZoneActions,
  /**
   * When provided, per-zone crop overrides stored on the file take precedence
   * over `preset.cropRegion`. Without it, viewZones falls back to the preset
   * default (legacy behaviour).
   */
  fileId?: string,
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

      // Prefer the per-track AnalyserNode published by the engine. If it's
      // missing (producer not wired for this engine, e.g. Sonic Pi today — see
      // .planning/phases/T-track-analyser/T-03-PARKED-sonic-pi.md), fall back
      // to the global master-mix analyser so the viz still reacts to SOMETHING
      // rather than sitting dead. Previous code returned `undefined` whenever
      // a trackStream existed without a trackAnalyser, which silently severed
      // audio for every Sonic Pi inline viz.
      const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey)
      const zoneAudio = trackAnalyser && audioCtx
        ? { analyser: trackAnalyser, audioCtx, trackAnalysers: components.audio?.trackAnalysers }
        : components.audio

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
      container.setAttribute('data-viz-zone-track', trackKey)
      container.setAttribute('data-viz-zone-id', vizId)
      container.style.cssText = `overflow:hidden;height:${layout.zoneH}px;position:relative;`

      const zoneDesc = {
        afterLineNumber: afterLine,
        heightInPx: layout.zoneH,
        domNode: container,
        suppressMouseDown: true,
      }
      const zoneId = accessor.addZone(zoneDesc)

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

      // Plant a decoration on the .viz("<vizId>") source line so the zone
      // follows its block when other blocks are inserted or removed. Uses
      // NeverGrowsWhenTypingAtEdges stickiness so adjacent edits don't
      // stretch the anchor. If the call can't be found (unlikely —
      // vizRequests came from the engine scanning the same code), skip
      // decoration and the zone will stay static until next evaluate.
      let vizDecoration: Monaco.editor.IEditorDecorationsCollection | null = null
      const modelForMount = editor.getModel?.()
      if (modelForMount) {
        const vizLine = findVizCallLineForBlock(
          modelForMount.getValue(),
          vizId,
          afterLine,
        )
        if (vizLine !== null) {
          const maxCol = modelForMount.getLineMaxColumn?.(vizLine) ?? 1
          vizDecoration = editor.createDecorationsCollection([
            {
              range: {
                startLineNumber: vizLine,
                startColumn: 1,
                endLineNumber: vizLine,
                endColumn: maxCol,
              },
              options: { stickiness: 1 },
            },
          ])
        }
      }

      const entry: ZoneEntry = {
        zoneId, zoneDesc, afterLine, container, canvas, trackKey, vizId, presetId: null, native, crop, vizDecoration,
      }
      zoneEntries.push(entry)

      // ── Resize handle (bottom edge) ──
      // Thin strip at the bottom of the zone — reveals on hover, drag
      // to resize the zone height. Persists via setZoneHeightOverride.
      const resizeHandle = document.createElement('div')
      resizeHandle.style.cssText = `
        position:absolute;bottom:0;left:0;right:0;height:6px;
        cursor:row-resize;z-index:50;
        background:transparent;transition:background 150ms;
      `
      resizeHandle.addEventListener('mouseenter', () => {
        resizeHandle.style.background = 'var(--accent-strong, #7c7cff)'
        resizeHandle.style.opacity = '0.6'
      })
      resizeHandle.addEventListener('mouseleave', () => {
        if (!resizeHandle.dataset.dragging) {
          resizeHandle.style.background = 'transparent'
          resizeHandle.style.opacity = '1'
        }
      })
      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        resizeHandle.dataset.dragging = '1'
        entry.container.dataset.resizing = '1'
        const startY = e.clientY
        const startH = entry.zoneDesc.heightInPx
        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientY - startY
          const newH = Math.max(MIN_ZONE_HEIGHT, Math.min(MAX_ZONE_HEIGHT, startH + delta))
          // Update CSS only during drag — don't call changeViewZones
          // or it triggers recomputeAllZones which resets the height.
          entry.container.style.height = `${newH}px`
          entry.zoneDesc.heightInPx = newH
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          delete resizeHandle.dataset.dragging
          delete entry.container.dataset.resizing
          resizeHandle.style.background = 'transparent'
          resizeHandle.style.opacity = '1'
          // Commit the final height to Monaco + persist.
          editor.changeViewZones((acc) => acc.layoutZone(entry.zoneId))
          if (fileId) {
            setZoneHeightOverride(fileId, entry.trackKey, entry.zoneDesc.heightInPx)
          }
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      })
      // Block Monaco from intercepting pointer events on the handle.
      for (const evt of ['mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const) {
        resizeHandle.addEventListener(evt, (e) => { e.stopPropagation(); e.stopImmediatePropagation() }, true)
      }
      container.appendChild(resizeHandle)

      // p5's createCanvas(W, H) may pick dimensions that differ from the
      // preset's declared nativeSize. The transform math MUST use the
      // canvas's ACTUAL intrinsic size or the viz overflows its zone.
      // Poll via rAF for up to 10 frames (~170ms) — once the canvas
      // appears with non-zero dims, refine entry.native and recompute.
      let refineAttempts = 0
      const tryRefine = () => {
        refineAttempts++
        const actual = readCanvasNative(entry.container)
        if (actual && (actual.w !== entry.native.w || actual.h !== entry.native.h)) {
          entry.native = actual
          entry.canvas = entry.container.querySelector<HTMLCanvasElement>('canvas')
          const contentW = editor.getLayoutInfo().contentWidth || 400
          const refined = computeLayout(contentW, entry.native, entry.crop)
          editor.changeViewZones((acc) => {
            entry.zoneDesc.heightInPx = refined.zoneH
            entry.container.style.height = `${refined.zoneH}px`
            acc.layoutZone(entry.zoneId)
          })
          applyLayout(entry.container, entry.container.querySelector('canvas'), refined)
          return
        }
        if (refineAttempts < 10) requestAnimationFrame(tryRefine)
      }
      requestAnimationFrame(tryRefine)
    }
  })

  // ── Prune stale zone overrides ──
  // Remove overrides for trackKeys that no longer exist in vizRequests
  // (block removed / anonymous keys shifted) or whose vizId changed.
  if (fileId) {
    const currentViz = new Map<string, string>()
    for (const [trackKey, { vizId }] of vizRequests) {
      currentViz.set(trackKey, vizId)
    }
    pruneZoneOverrides(fileId, currentViz)
  }

  // ── Async: load presets and refine native size + crop ──
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '')
  void (async () => {
    try {
      const presets = await VizPresetStore.getAll()
      editor.changeViewZones((accessor) => {
        for (const entry of zoneEntries) {
          // Read the per-instance crop override FIRST — this must happen
          // regardless of whether a VizPreset exists in IDB. The preset
          // seed is async and may not have finished yet on first load;
          // gating the override behind `if (!preset) continue` caused
          // crops to silently fail when the race lost.
          const override = fileId ? getZoneCropOverride(fileId, entry.trackKey) : undefined

          const normViz = normalize(entry.vizId)
          const preset = presets.find(p => normalize(p.name) === normViz) ?? null
          if (preset) {
            entry.presetId = preset.id
          }
          // Prefer the canvas's actual intrinsic size if it's already been
          // created — sketches author their own dimensions via createCanvas()
          // and those are what the transform math must use. Preset nativeSize
          // is the fallback when the canvas hasn't appeared yet.
          const actual = readCanvasNative(entry.container)
          entry.native = actual ?? (preset ? nativeSizeFor(preset) : entry.native)
          entry.crop = override ?? preset?.cropRegion ?? FULL_CROP
          const contentW = editor.getLayoutInfo().contentWidth || 400
          const layout = computeLayout(contentW, entry.native, entry.crop)
          // User height override (drag-to-resize) takes precedence.
          const hOverride = fileId ? getZoneHeightOverride(fileId, entry.trackKey) : undefined
          const finalH = hOverride ?? layout.zoneH
          entry.zoneDesc.heightInPx = finalH
          entry.container.style.height = `${finalH}px`
          accessor.layoutZone(entry.zoneId)
          applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
        }
      })
      // After heights change, Monaco repositions zones — ensure the
      // canvas still fills each container via transform reapplication.
      for (const entry of zoneEntries) {
        const contentW = editor.getLayoutInfo().contentWidth || 400
        const layout = computeLayout(contentW, entry.native, entry.crop)
        const hOverride = fileId ? getZoneHeightOverride(fileId, entry.trackKey) : undefined
        const finalH = hOverride ?? layout.zoneH
        entry.zoneDesc.heightInPx = finalH
        entry.container.style.height = `${finalH}px`
        applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
      }
    } catch { /* ignore */ }
  })()

  // ── Recompute on layout + scroll ──
  // Monaco re-applies the original addZone heightInPx when a zone
  // re-enters the viewport after scrolling away. We must re-assert the
  // crop-adjusted height whenever layout changes OR the user scrolls.
  const recomputeAllZones = () => {
    editor.changeViewZones((accessor) => {
      for (const entry of zoneEntries) {
        // Skip zones being actively resized — their height is
        // controlled by the drag handler, not layout computation.
        if (entry.container.dataset.resizing) continue
        const contentW = editor.getLayoutInfo().contentWidth || 400
        const layout = computeLayout(contentW, entry.native, entry.crop)
        const hOverride = fileId ? getZoneHeightOverride(fileId, entry.trackKey) : undefined
        const finalH = hOverride ?? layout.zoneH
        entry.zoneDesc.heightInPx = finalH
        entry.container.style.height = `${finalH}px`
        accessor.layoutZone(entry.zoneId)
        applyLayout(entry.container, entry.container.querySelector('canvas'), layout)
      }
    })
  }
  const layoutChangeDisposable = editor.onDidLayoutChange?.(recomputeAllZones)
  const scrollDisposable = editor.onDidScrollChange?.(recomputeAllZones)

  // ── Live re-anchor on content edits ──
  // The engine computes `afterLine` from `lastEvaluatedCode`, so between
  // evaluations zones stay pinned to stale line numbers. As the user types
  // above/inside a $: block, its last line shifts but the zone stays put.
  // On every content change, rescan the model for $: block ends and move
  // any zone whose block has grown or shrunk. Matched by anonymous index
  // ($0/$1/…) against the existing trackKey — stable as long as block count
  // doesn't change, which is the common edit-within-block case. Block
  // count changes defer to the next evaluate (engine re-keys the map).
  const reAnchorZones = () => {
    const model = editor.getModel?.()
    if (!model) return
    const lines = model.getValue().split('\n')

    const changed: ZoneEntry[] = []
    for (const entry of zoneEntries) {
      // Decoration-based: the decoration follows its text through every
      // edit, so its current line is a reliable pointer to where .viz()
      // lives NOW. This replaces the earlier positional trackKey $N →
      // afterLines[N] mapping, which was fragile when other blocks were
      // added or removed. Zones without a decoration (call not found at
      // mount) stay static until the next evaluate.
      if (!entry.vizDecoration) continue
      const ranges = entry.vizDecoration.getRanges()
      if (ranges.length === 0) continue

      const vizLineIdx = ranges[0].startLineNumber - 1 // back to 0-indexed
      if (vizLineIdx < 0 || vizLineIdx >= lines.length) continue

      // Walk backward to the $: that opens this block.
      let blockStart = vizLineIdx
      while (blockStart >= 0 && !lines[blockStart].trim().startsWith('$:')) {
        blockStart--
      }
      if (blockStart < 0) continue // decoration sits above any $:, bail

      // Scan forward for the block's last non-empty, non-comment line.
      let blockEnd = blockStart
      for (let j = blockStart + 1; j < lines.length; j++) {
        const next = lines[j].trim()
        if (next.startsWith('$:') || next.startsWith('setcps')) break
        if (next !== '' && !next.startsWith('//')) blockEnd = j
      }

      const newAfterLine = blockEnd + 1
      if (newAfterLine !== entry.afterLine) {
        entry.afterLine = newAfterLine
        entry.zoneDesc.afterLineNumber = newAfterLine
        changed.push(entry)
      }
    }

    if (changed.length === 0) return
    editor.changeViewZones((accessor) => {
      for (const entry of changed) {
        accessor.removeZone(entry.zoneId)
        entry.zoneId = accessor.addZone(entry.zoneDesc)
      }
    })
  }
  const contentChangeDisposable = editor.onDidChangeModelContent?.(reAnchorZones)

  // ── Floating action bar (unchanged from before) ──
  const editorDom = editor.getDomNode?.()
  let floatingBar: HTMLElement | null = null
  let mouseMoveDisposable: { dispose(): void } | null = null
  let scrollHitTestDisposable: { dispose(): void } | null = null

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
      const trackKey = floatingBar?.getAttribute('data-track-key') || ''
      if (vizId && trackKey && actions.onCrop) actions.onCrop(vizId, presetId, trackKey)
    }

    // Track last mouse position so we can re-run hit-testing on scroll.
    // (Scrolling doesn't fire mouseMove, so without this the action bar
    // gets stuck visible after the zone scrolls away from the cursor.)
    let lastMouseX = -1
    let lastMouseY = -1
    const hitTestAndUpdateBar = () => {
      if (!floatingBar || lastMouseX < 0) return
      let found: ZoneEntry | null = null
      for (const entry of zoneEntries) {
        const rect = entry.container.getBoundingClientRect()
        if (lastMouseY >= rect.top && lastMouseY <= rect.bottom && lastMouseX >= rect.left && lastMouseX <= rect.right) {
          found = entry
          break
        }
      }
      if (found) {
        const rect = found.container.getBoundingClientRect()
        const guardRect = (editorDom.querySelector('.overflow-guard') || editorDom).getBoundingClientRect()
        floatingBar.style.top = `${rect.top - guardRect.top + 4}px`
        floatingBar.style.left = `${rect.right - guardRect.left - 68}px`
        floatingBar.style.opacity = '1'
        floatingBar.style.pointerEvents = 'auto'
        floatingBar.setAttribute('data-viz-id', found.vizId)
        floatingBar.setAttribute('data-preset-id', found.presetId || '')
        floatingBar.setAttribute('data-track-key', found.trackKey)
      } else {
        floatingBar.style.opacity = '0'
        floatingBar.style.pointerEvents = 'none'
      }
    }
    mouseMoveDisposable = editor.onMouseMove?.((ev: Monaco.editor.IEditorMouseEvent) => {
      lastMouseX = ev.event.posx
      lastMouseY = ev.event.posy
      hitTestAndUpdateBar()
    }) ?? null
    // Re-hit-test when scrolling — zones move under a stationary cursor,
    // so the bar's visible state must be re-evaluated.
    scrollHitTestDisposable = editor.onDidScrollChange?.(hitTestAndUpdateBar) ?? null
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
      scrollHitTestDisposable?.dispose?.()
      layoutChangeDisposable?.dispose?.()
      scrollDisposable?.dispose?.()
      contentChangeDisposable?.dispose?.()
      editorDom?.removeEventListener('mouseleave', mouseLeaveHandler)
      floatingBar?.remove()
      renderers.forEach(r => r.destroy())
      bufferedSchedulers.forEach(s => s.dispose())
      editor.changeViewZones((accessor) => {
        zoneEntries.forEach(e => accessor.removeZone(e.zoneId))
      })
      zoneEntries.forEach(e => e.vizDecoration?.clear())
    },
    pause() { renderers.forEach(r => r.pause()) },
    resume() { renderers.forEach(r => r.resume()) },
  }
}
