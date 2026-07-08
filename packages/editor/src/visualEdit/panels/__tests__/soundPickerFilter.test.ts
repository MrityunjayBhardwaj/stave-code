import { describe, it, expect } from 'vitest'

import {
  soundCategory,
  categoryCounts,
  totalOptions,
  filterGroups,
} from '../soundPickerFilter'
import type { SoundGroup } from '../soundCatalog'

const groups: SoundGroup[] = [
  { group: 'Synths', options: [{ value: 'sawtooth', label: 'Sawtooth' }, { value: 'sine', label: 'Sine' }] },
  { group: 'Soundfonts · Strings', options: [{ value: 'gm_violin', label: 'Violin' }] },
  { group: 'Soundfonts · Brass', options: [{ value: 'gm_trumpet', label: 'Trumpet' }, { value: 'gm_tuba', label: 'Tuba' }] },
  { group: 'Samples', options: [{ value: 'piano', label: 'Piano' }] },
]

describe('soundPickerFilter (#827)', () => {
  it('soundCategory takes the prefix before ` · `, else the whole group', () => {
    expect(soundCategory('Soundfonts · Strings')).toBe('Soundfonts')
    expect(soundCategory('Synths')).toBe('Synths')
    expect(soundCategory('Roland')).toBe('Roland')
  })

  it('categoryCounts sums sub-groups into one category, sorted by count desc', () => {
    expect(categoryCounts(groups)).toEqual([
      { category: 'Soundfonts', count: 3 }, // Strings(1) + Brass(2)
      { category: 'Synths', count: 2 },
      { category: 'Samples', count: 1 },
    ])
  })

  it('totalOptions counts every option', () => {
    expect(totalOptions(groups)).toBe(6)
  })

  it('filterGroups returns the same groups for a blank query + no category', () => {
    expect(filterGroups(groups, '', null)).toBe(groups)
  })

  it('filterGroups narrows to a category (sub-groups included), dropping others', () => {
    const r = filterGroups(groups, '', 'Soundfonts')
    expect(r.map((g) => g.group)).toEqual(['Soundfonts · Strings', 'Soundfonts · Brass'])
  })

  it('filterGroups matches the query over label OR value, drops empty groups', () => {
    // "tuba" matches a Brass label; nothing else → only that group, one option.
    const r = filterGroups(groups, 'tuba', null)
    expect(r).toEqual([{ group: 'Soundfonts · Brass', options: [{ value: 'gm_tuba', label: 'Tuba' }] }])
    // "gm_" matches by VALUE across both soundfont groups.
    const byValue = filterGroups(groups, 'gm_', null)
    expect(byValue.flatMap((g) => g.options.map((o) => o.value)).sort()).toEqual([
      'gm_trumpet', 'gm_tuba', 'gm_violin',
    ])
  })

  it('filterGroups composes query AND category', () => {
    const r = filterGroups(groups, 'trumpet', 'Soundfonts')
    expect(r).toEqual([{ group: 'Soundfonts · Brass', options: [{ value: 'gm_trumpet', label: 'Trumpet' }] }])
    // query in a different category → empty
    expect(filterGroups(groups, 'sawtooth', 'Soundfonts')).toEqual([])
  })
})
