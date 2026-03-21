import { useEffect, useRef, useCallback } from 'react'
import type * as Monaco from 'monaco-editor'
import type { HapStream, HapEvent } from '../engine/HapStream'

// ---- Per-color style injection cache ----
const injectedColorClasses = new Map<string, boolean>()

/**
 * Simple string hash to create stable class name suffixes from color strings.
 * Not cryptographic — just needs to be collision-resistant for CSS class names.
 */
function hashColor(color: string): string {
  let hash = 0
  for (let i = 0; i < color.length; i++) {
    hash = (hash * 31 + color.charCodeAt(i)) | 0
  }
  // Make positive and convert to hex
  return Math.abs(hash).toString(16)
}

/**
 * Parse a CSS color string to RGB values using a canvas context.
 * Returns null if parsing fails.
 */
function parseColorToRGB(
  color: string
): { r: number; g: number; b: number } | null {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data
    return { r: data[0], g: data[1], b: data[2] }
  } catch {
    return null
  }
}

/**
 * Returns the CSS class name to apply to a decoration.
 * If color is non-null, injects a per-color style rule and returns compound class.
 */
export function getDecorationClassName(color: string | null): string {
  const base = 'strudel-active-hap'
  if (!color) return base

  const hash = hashColor(color)
  const colorClass = `strudel-active-hap--c${hash}`

  if (!injectedColorClasses.has(colorClass) && typeof document !== 'undefined') {
    injectedColorClasses.set(colorClass, true)
    const rgb = parseColorToRGB(color)
    if (rgb) {
      const style = document.createElement('style')
      style.textContent = `
        .${colorClass} {
          background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3) !important;
          outline: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5) !important;
          box-shadow: 0 0 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3) !important;
        }
      `
      document.head.appendChild(style)
    }
  }

  return `${base} ${colorClass}`
}

/**
 * Convert a zero-based character offset to a Monaco 1-based Position.
 */
function locToRange(
  model: Monaco.editor.ITextModel,
  start: number,
  end: number
): Monaco.IRange {
  const startPos = model.getPositionAt(start)
  const endPos = model.getPositionAt(end)
  return {
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
  }
}

/**
 * Shared teardown — cancels all pending timeouts and clears all decoration collections.
 */
function teardown(
  timeoutIds: number[],
  collections: Map<string, Monaco.editor.IEditorDecorationsCollection>
): void {
  for (const id of timeoutIds) {
    clearTimeout(id)
  }
  timeoutIds.length = 0
  for (const col of collections.values()) {
    col.clear()
  }
  collections.clear()
}

export interface UseHighlightingReturn {
  clearAll: () => void
}

/**
 * useHighlighting — bridges HapStream events to Monaco editor decorations.
 *
 * Subscribes to the HapStream and for each HapEvent with location data:
 * 1. Schedules a setTimeout at `scheduledAheadMs` to show a decoration
 * 2. Schedules a setTimeout at `scheduledAheadMs + audioDuration*1000` to clear it
 *
 * Each hap gets its own IEditorDecorationsCollection for independent lifecycle management.
 * All timeouts and collections are cleaned up on hapStream change or component unmount.
 */
export function useHighlighting(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  hapStream: HapStream | null
): UseHighlightingReturn {
  // Flat array of all pending timeout IDs — for bulk cancellation
  const timeoutIdsRef = useRef<number[]>([])

  // Per-hap decoration collections keyed by unique monotonic ID
  const hapCollectionsRef = useRef<
    Map<string, Monaco.editor.IEditorDecorationsCollection>
  >(new Map())

  // Monotonic counter for unique hap keys within this hook instance
  const hapCounterRef = useRef(0)

  const clearAll = useCallback(() => {
    teardown(timeoutIdsRef.current, hapCollectionsRef.current)
  }, [])

  useEffect(() => {
    if (!editor || !hapStream) return

    const handler = (event: HapEvent): void => {
      if (!event.loc || event.loc.length === 0) return

      const model = editor.getModel()
      if (!model) return

      const hapKey = `hap-${hapCounterRef.current++}`
      const showDelay = Math.max(0, event.scheduledAheadMs)
      const clearDelay = showDelay + event.audioDuration * 1000
      const className = getDecorationClassName(event.color)

      const showId = window.setTimeout(() => {
        const decorations = event.loc!.map(({ start, end }) => ({
          range: locToRange(model, start, end),
          options: {
            className,
            stickiness: 1 as const, // NeverGrowsWhenTypingAtEdges
          },
        }))
        const collection = editor.createDecorationsCollection(decorations)
        hapCollectionsRef.current.set(hapKey, collection)
      }, showDelay)

      const clearId = window.setTimeout(() => {
        hapCollectionsRef.current.get(hapKey)?.clear()
        hapCollectionsRef.current.delete(hapKey)
      }, clearDelay)

      timeoutIdsRef.current.push(showId, clearId)
    }

    hapStream.on(handler)

    return () => {
      hapStream.off(handler)
      teardown(timeoutIdsRef.current, hapCollectionsRef.current)
    }
  }, [editor, hapStream])

  return { clearAll }
}
