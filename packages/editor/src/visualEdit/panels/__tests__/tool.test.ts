import { describe, it, expect } from 'vitest'

import { TOOLS, DEFAULT_TOOL, resolveCellAction, type Tool } from '../tool'

describe('tool catalogue (#433)', () => {
  it('defaults to the Pointer (smart) tool', () => {
    expect(DEFAULT_TOOL).toBe('pointer')
  })
  it('offers all six Logic tools in order', () => {
    expect(TOOLS.map((t) => t.value)).toEqual([
      'pointer',
      'pencil',
      'eraser',
      'velocity',
      'scissors',
      'glue',
    ])
  })
  it('enables only Pointer/Pencil/Eraser in Phase 1; the rest are visible-but-disabled', () => {
    const enabled = Object.fromEntries(TOOLS.map((t) => [t.value, t.enabled]))
    expect(enabled.pointer).toBe(true)
    expect(enabled.pencil).toBe(true)
    expect(enabled.eraser).toBe(true)
    expect(enabled.velocity).toBe(false)
    expect(enabled.scissors).toBe(false)
    expect(enabled.glue).toBe(false)
  })
  it('every tool carries a codicon glyph name', () => {
    for (const t of TOOLS) expect(t.icon).toMatch(/^[a-z-]+$/)
  })
})

describe('resolveCellAction — the tool → gesture seam', () => {
  it('Pencil forces place, Eraser forces erase', () => {
    expect(resolveCellAction('pencil')).toBe('place')
    expect(resolveCellAction('eraser')).toBe('erase')
  })
  it('Pointer and not-yet-enabled tools fall back to the smart gesture (never a no-op)', () => {
    const fallback: Tool[] = ['pointer', 'velocity', 'scissors', 'glue']
    for (const t of fallback) expect(resolveCellAction(t)).toBe('smart')
  })
})
