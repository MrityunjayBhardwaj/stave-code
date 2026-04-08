import { describe, it, expect } from 'vitest'
import {
  sanitizePresetName,
  bundledPresetId,
  isBundledPresetId,
  generateUniquePresetId,
  BUNDLED_PREFIX,
} from '../visualizers/vizPreset'

describe('sanitizePresetName', () => {
  it('lowercases and replaces non-alphanumerics with underscore', () => {
    expect(sanitizePresetName('My Aurora!')).toBe('my_aurora')
    expect(sanitizePresetName('Piano Roll')).toBe('piano_roll')
    expect(sanitizePresetName('Piano Roll (Hydra)')).toBe('piano_roll_hydra')
  })

  it('strips leading and trailing underscores', () => {
    expect(sanitizePresetName('  spaces  ')).toBe('spaces')
    expect(sanitizePresetName('___leading')).toBe('leading')
    expect(sanitizePresetName('trailing___')).toBe('trailing')
  })

  it('falls back to "untitled" for empty / unsanitizable input', () => {
    expect(sanitizePresetName('')).toBe('untitled')
    expect(sanitizePresetName('!!!')).toBe('untitled')
    expect(sanitizePresetName('   ')).toBe('untitled')
  })
})

describe('bundledPresetId', () => {
  it('uses the reserved prefix and renderer suffix', () => {
    expect(bundledPresetId('Piano Roll', 'p5')).toBe('__bundled_piano_roll_p5__')
    expect(bundledPresetId('Piano Roll Hydra', 'hydra')).toBe('__bundled_piano_roll_hydra_hydra__')
  })

  it('produces ids that isBundledPresetId recognizes', () => {
    const id = bundledPresetId('Demo', 'p5')
    expect(isBundledPresetId(id)).toBe(true)
  })

  it('does not collide with user-format ids', () => {
    // User format never starts with `__`
    const userId = generateUniquePresetId('Piano Roll', 'p5', [])
    expect(isBundledPresetId(userId)).toBe(false)
    expect(userId.startsWith(BUNDLED_PREFIX)).toBe(false)
  })
})

describe('generateUniquePresetId', () => {
  it('uses v1 when no collision exists', () => {
    expect(generateUniquePresetId('Piano Roll', 'p5', [])).toBe('piano_roll_p5_v1')
    expect(generateUniquePresetId('Piano Roll', 'hydra', [])).toBe('piano_roll_hydra_v1')
  })

  it('increments version when v1 already exists', () => {
    expect(
      generateUniquePresetId('Piano Roll', 'p5', ['piano_roll_p5_v1']),
    ).toBe('piano_roll_p5_v2')
  })

  it('finds the next free version skipping all collisions', () => {
    const existing = ['piano_roll_p5_v1', 'piano_roll_p5_v2', 'piano_roll_p5_v3']
    expect(generateUniquePresetId('Piano Roll', 'p5', existing)).toBe('piano_roll_p5_v4')
  })

  it('handles non-contiguous version gaps', () => {
    // v2 is missing — but v1 is taken so we still go to v2
    const existing = ['piano_roll_p5_v1', 'piano_roll_p5_v3']
    expect(generateUniquePresetId('Piano Roll', 'p5', existing)).toBe('piano_roll_p5_v2')
  })

  it('different renderers do not collide on the same name', () => {
    const existing = ['piano_roll_p5_v1']
    expect(generateUniquePresetId('Piano Roll', 'hydra', existing)).toBe('piano_roll_hydra_v1')
  })

  it('ignores bundled ids when generating user ids (different format)', () => {
    // Bundled ids use `__bundled_<name>_<renderer>__` so they CAN'T collide
    // with user ids regardless of whether they're in the existing set.
    const existing = ['__bundled_piano_roll_p5__']
    expect(generateUniquePresetId('Piano Roll', 'p5', existing)).toBe('piano_roll_p5_v1')
  })

  it('sanitizes the name before generating', () => {
    expect(generateUniquePresetId('My Aurora!', 'p5', [])).toBe('my_aurora_p5_v1')
    expect(generateUniquePresetId('  Spaces  ', 'hydra', [])).toBe('spaces_hydra_v1')
  })

  it('falls back to "untitled" for empty names', () => {
    expect(generateUniquePresetId('', 'p5', [])).toBe('untitled_p5_v1')
    expect(generateUniquePresetId('', 'p5', ['untitled_p5_v1'])).toBe('untitled_p5_v2')
  })

  it('accepts a Set as the existing collection', () => {
    const existing = new Set(['piano_roll_p5_v1', 'piano_roll_p5_v2'])
    expect(generateUniquePresetId('Piano Roll', 'p5', existing)).toBe('piano_roll_p5_v3')
  })
})
