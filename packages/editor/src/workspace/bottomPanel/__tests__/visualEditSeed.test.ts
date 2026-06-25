import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerBottomPanelTab,
  listBottomPanelTabs,
  __resetBottomPanelRegistryForTest,
} from '../bottomPanelRegistry'
import { seedVisualEditTabs } from '../visualEditSeed'
import { VISUAL_EDIT_TABS } from '../../../visualEdit/panels/tabs'

describe('VISUAL_EDIT_TABS metadata', () => {
  it('defines the Pattern tab and the Mixer console tab (#398 / #540)', () => {
    expect(VISUAL_EDIT_TABS.map((t) => t.id)).toEqual(['pattern', 'mixer-console'])
    expect(VISUAL_EDIT_TABS.map((t) => t.title)).toEqual(['Pattern', 'Mixer'])
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

  it('registers the Pattern and Mixer tabs', () => {
    seedVisualEditTabs()
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual(['pattern', 'mixer-console'])
  })

  it('appears alongside an already-seeded Timeline, after it', () => {
    registerBottomPanelTab({ id: 'musical-timeline', title: 'Timeline', content: null })
    seedVisualEditTabs()
    expect(listBottomPanelTabs().map((t) => t.id)).toEqual([
      'musical-timeline',
      'pattern',
      'mixer-console',
    ])
  })

  it('is idempotent — re-seeding does not duplicate tabs', () => {
    seedVisualEditTabs()
    seedVisualEditTabs()
    expect(listBottomPanelTabs().filter((t) => t.id === 'pattern')).toHaveLength(1)
  })
})
