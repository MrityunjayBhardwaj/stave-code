import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { assertRatchet } from '../ratchet'
import { literalSites, scanTree, tallySites, type Site } from '../siteInventory'

/**
 * The site inventory gate (#1298, #1866 part 2). The detectors find; `inventory.json`
 * classifies. A site the tree has and the inventory does not — or the reverse — fails, and the
 * three classes that ARE re-modelling may only fall (the ratchet, `ledger.json`).
 */

const CLASSES = ['authoring', 'hand-grammar', 'js-grammar', 'surgery', 'boundary', 'other-text'] as const
type Class = (typeof CLASSES)[number]

/** the classes that are re-modelling, each a ratcheted count */
const RATCHETED: Record<string, Class> = {
  'inventory.authoring': 'authoring',
  'inventory.hand-grammar': 'hand-grammar',
  'inventory.js-grammar': 'js-grammar',
}

interface Row {
  count: number
  class: Class
  why: string
}

const INVENTORY = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'inventory.json')
const loadInventory = (): Record<string, Row> => JSON.parse(fs.readFileSync(INVENTORY, 'utf8')).sites

const keys = (sites: Site[]) => sites.map((s) => `${s.shape}|${s.text}`)

describe('the literal-shape detector', () => {
  it('finds each shape in a planted source, in either package', () => {
    const src = [
      'function a(t: string) { return /^[@!]/.test(t) }',
      'function b(x: string) { return `[${x}]` }',
      "function c(x: string) { return '<' + x }",
      "function d(ch: string) { return '[<{('.includes(ch) }",
      "function e(ch: string) { return ch === ']' }",
    ].join('\n')
    for (const rel of ['packages/editor/src/planted.ts', 'packages/app/src/planted.ts']) {
      const found = literalSites(rel, src)
      expect(found.map((s) => s.shape).sort()).toEqual(['concat', 'regex', 'scanner', 'scanner', 'template'])
      expect(found.map((s) => s.fn).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    }
  })

  it('does not fire on text with no mini syntax against a substitution', () => {
    const src = 'const a = (x: string) => `${x}-${x}.json`\nconst b = (x: string) => "path/" + x\nconst c = (x: string) => x === "a"'
    expect(literalSites('packages/editor/src/planted.ts', src)).toEqual([])
  })

  it("leaves parseStrudel.ts's regex literals to the predicate audit, but not its other shapes", () => {
    const src = 'const r = /^\\s*$/\nconst t = (x: string) => `[${x}]`'
    expect(keys(literalSites('packages/editor/src/ir/parseStrudel.ts', src))).toEqual(['template|`[${x}]`'])
    expect(keys(literalSites('packages/editor/src/ir/parseMini.ts', src))).toEqual(['regex|/^\\s*$/', 'template|`[${x}]`'])
  })
})

describe('the tree', () => {
  let sites: Site[]
  beforeAll(() => {
    sites = scanTree()
  }, 300_000)

  it('the model → text detector finds the emitters #1298 named, and not a text → text helper', () => {
    const typed = new Set(sites.filter((s) => s.shape === 'model-to-text').map((s) => s.fn))
    for (const fn of ['gridColumns', 'serializeRollLanes', 'rebuildGrid', 'reemitRegion', 'respellBar', 'laneString']) {
      expect(typed.has(fn), `${fn} is a model → text writer and must be detected`).toBe(true)
    }
    // `asEntry` takes text, so the TYPE detector must not claim it — the literal detector does
    expect(typed.has('asEntry')).toBe(false)
    expect(sites.some((s) => s.fn === 'asEntry' && s.shape === 'regex')).toBe(true)
  })

  it('every site is in the inventory, and every inventory row is still a site', () => {
    const found = tallySites(sites)
    const inventory = loadInventory()
    const missing: string[] = []
    const stale: string[] = []
    for (const [k, n] of found) {
      const have = inventory[k]?.count ?? 0
      if (have < n) missing.push(`${k}  (${n} in source, ${have} in inventory)`)
    }
    for (const [k, row] of Object.entries(inventory)) {
      const n = found.get(k) ?? 0
      if (n < row.count) stale.push(`${k}  (${row.count} in inventory, ${n} in source)`)
    }
    const how =
      '\nA new site must be classified in modellingRatchet/inventory.json: { "count", "class" (one of ' +
      CLASSES.join(', ') +
      '), "why" }. A site that moved or went away must have its row updated or removed.'
    expect(missing, `sites in the tree with no inventory row:${how}`).toEqual([])
    expect(stale, `inventory rows no longer in the tree:${how}`).toEqual([])
  })

  it('every inventory row has a known class and a reason', () => {
    const bad = Object.entries(loadInventory())
      .filter(([, r]) => !CLASSES.includes(r.class) || !r.why?.trim() || !Number.isInteger(r.count) || r.count < 1)
      .map(([k]) => k)
    expect(bad).toEqual([])
  })

  it('the re-modelling classes may only fall', () => {
    const rows = Object.values(loadInventory())
    for (const [name, cls] of Object.entries(RATCHETED)) {
      assertRatchet(name, rows.filter((r) => r.class === cls).reduce((a, r) => a + r.count, 0))
    }
  })
})

