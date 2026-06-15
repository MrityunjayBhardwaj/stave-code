import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerBottomPanelTab,
  listBottomPanelTabs,
  __resetBottomPanelRegistryForTest,
} from '../bottomPanelRegistry'
import { seedVisualEditTabs } from '../visualEditSeed'
import { VISUAL_EDIT_TABS } from '../../../visualEdit/panels/tabs'

describe('VISUAL_EDIT_TABS metadata', () => {
  it('defines exactly the three musician panels', () => {
    expect(VISUAL_EDIT_TABS.map((t) => t.id)).toEqual(['sequencer', 'mixer', 'piano-roll'])
    expect(VISUAL_EDIT_TABS.map((t) => t.title)).toEqual(['Sequencer', 'Mixer', 'Piano Roll'])
  })

  it('has unique ids and a hint + icon per tab', () => {
    const ids = VISUAL_EDIT_TABS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of VISUAL_EDIT_TABS) {
      expect(t.hint.length).toBeGreaterThan(0)
      expect(t.icon.length).toBeGreaterThan(0)
    }
  })

  it('keeps IR jargon out of titles and hints (PV32 / D-06)', () => {
    const jargon = /\b(IR|intermediate representation|AST|chunk|mini-?notation|writeback)\b/i
    for (const t of VISUAL_EDIT_TABS) {
      expect(jargon.test(t.title), `title "${t.title}"`).toBe(false)
      expect(jargon.test(t.hint), `hint "${t.hint}"`).toBe(false)
    }
  })
})

describe('seedVisualEditTabs', () => {
  beforeEach(() => __resetBottomPanelRegistryForTest())

  it('registers all three tabs', () => {
    seedVisualEditTabs()
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual(['sequencer', 'mixer', 'piano-roll'])
  })

  it('appears alongside an already-seeded Timeline, after it', () => {
    registerBottomPanelTab({ id: 'musical-timeline', title: 'Timeline', content: null })
    seedVisualEditTabs()
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual([
      'musical-timeline',
      'sequencer',
      'mixer',
      'piano-roll',
    ])
  })

  it('is idempotent — re-seeding does not duplicate tabs', () => {
    seedVisualEditTabs()
    seedVisualEditTabs()
    expect(listBottomPanelTabs().filter((t) => t.id === 'mixer')).toHaveLength(1)
  })
})
