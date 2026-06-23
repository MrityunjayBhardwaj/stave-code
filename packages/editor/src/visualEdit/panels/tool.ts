/**
 * tool — the Pattern grids' edit-tool model (#433, Logic-parity tool palette).
 *
 * Logic's Tool menu makes the grid's edit MODE explicit and selectable instead
 * of purely context-inferred. Stave's grids already infer the gesture from
 * context (empty cell → place, note → select/move, edge → resize, Delete →
 * remove); a selected tool OVERRIDES that inference for the click/paint path.
 *
 * Phase 1 (#433) ships three working tools + three visible-but-disabled
 * placeholders (their behaviour is Phase 2 — never a silent dead affordance):
 *   - Pointer  → the existing smart gesture (select / move / resize)   [live]
 *   - Pencil   → always draw (place note / step-on)                    [live]
 *   - Eraser   → always remove (delete note / step-off)                [live]
 *   - Velocity → velocity-drag tool                                    [Phase 2]
 *   - Scissors → split a note                                          [Phase 2]
 *   - Glue     → join adjacent notes                                   [Phase 2]
 *
 * Pure (no React/DOM) so the palette, both grids, and the future Phase-2
 * Ctrl-Cmd temporary-tool all resolve gestures through one seam.
 */

export type Tool = 'pointer' | 'pencil' | 'velocity' | 'eraser' | 'scissors' | 'glue'

export interface ToolDef {
  value: Tool
  label: string
  /** codicon glyph name (without the `codicon-` prefix) */
  icon: string
  /** false → visible but inert in Phase 1 (behaviour lands in Phase 2) */
  enabled: boolean
}

export const TOOLS: ToolDef[] = [
  { value: 'pointer', label: 'Pointer', icon: 'inspect', enabled: true },
  { value: 'pencil', label: 'Pencil', icon: 'edit', enabled: true },
  { value: 'eraser', label: 'Eraser', icon: 'trash', enabled: true },
  { value: 'velocity', label: 'Velocity', icon: 'pulse', enabled: false },
  { value: 'scissors', label: 'Scissors', icon: 'split-horizontal', enabled: false },
  { value: 'glue', label: 'Glue', icon: 'link', enabled: false },
]

export const DEFAULT_TOOL: Tool = 'pointer'

/**
 * What a cell press should DO under the active tool.
 *   - 'smart' → run the grid's existing context-inferred gesture (Pointer, and
 *     any not-yet-enabled tool, fall back here — never a no-op)
 *   - 'place' → force draw (Pencil)
 *   - 'erase' → force remove (Eraser)
 *
 * The Phase-1 seam: Phase 2 computes the EFFECTIVE tool (incl. the Ctrl-Cmd
 * temp-tool override) BEFORE calling this, so the grid handlers never change.
 */
export type CellAction = 'smart' | 'place' | 'erase'

export function resolveCellAction(tool: Tool): CellAction {
  switch (tool) {
    case 'pencil':
      return 'place'
    case 'eraser':
      return 'erase'
    default:
      return 'smart'
  }
}
