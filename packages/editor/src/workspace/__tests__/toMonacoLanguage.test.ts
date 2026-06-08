/**
 * `toMonacoLanguage` — the WorkspaceLanguage → Monaco language id map.
 * The mapping is identity today, but the exhaustive switch is the place a
 * new workspace language must be wired (issue #287 added `glsl`).
 */
import { describe, it, expect } from 'vitest'
import { toMonacoLanguage } from '../languages'
import type { WorkspaceLanguage } from '../types'

describe('toMonacoLanguage', () => {
  const cases: [WorkspaceLanguage, string][] = [
    ['strudel', 'strudel'],
    ['sonicpi', 'sonicpi'],
    ['hydra', 'hydra'],
    ['p5js', 'p5js'],
    ['glsl', 'glsl'],
    ['markdown', 'markdown'],
  ]
  it.each(cases)('%s → %s', (lang, expected) => {
    expect(toMonacoLanguage(lang)).toBe(expected)
  })
})
