/**
 * expandStore — the pure parse of persisted expand state (#550 / S4b).
 *
 * The localStorage round-trip + per-file isolation is covered by Playwright
 * (jsdom's localStorage stub here is non-functional). These lock the pure
 * `parseExpanded` boundary: a corrupt or absent key must degrade to an empty
 * Set, never throw — a bad persisted value can't be allowed to break the Mixer.
 */
import { describe, it, expect } from 'vitest'

import { parseExpanded } from '../expandStore'

describe('parseExpanded', () => {
  it('returns an empty set for null / empty string', () => {
    expect([...parseExpanded(null)]).toEqual([])
    expect([...parseExpanded('')]).toEqual([])
  })

  it('parses a JSON string array into a Set', () => {
    expect([...parseExpanded('["d1","$0"]')].sort()).toEqual(['$0', 'd1'])
  })

  it('dedupes repeated ids (Set semantics)', () => {
    expect([...parseExpanded('["d1","d1","$0"]')].sort()).toEqual(['$0', 'd1'])
  })

  it('drops non-string elements rather than trusting the blob', () => {
    expect([...parseExpanded('["d1",2,null,{"x":1},"$1"]')].sort()).toEqual(['$1', 'd1'])
  })

  it('degrades to empty on a non-array JSON value', () => {
    expect([...parseExpanded('{"d1":true}')]).toEqual([])
    expect([...parseExpanded('"d1"')]).toEqual([])
    expect([...parseExpanded('42')]).toEqual([])
  })

  it('degrades to empty on malformed JSON instead of throwing', () => {
    expect([...parseExpanded('["d1",')]).toEqual([])
    expect([...parseExpanded('not json at all')]).toEqual([])
  })
})
