import { describe, it, expect, beforeEach } from 'vitest'
import {
  enterRuntimeView,
  exitRuntimeView,
  getViewedContent,
  isViewing,
  getViewedCommit,
  getViewedFileIds,
  subscribeToRuntimeView,
  __resetRuntimeViewForTests,
} from '../historyViewing'

describe('historyViewing — runtime-follow override layer (#204)', () => {
  beforeEach(() => __resetRuntimeViewForTests())

  it('starts not viewing; reads fall through to null', () => {
    expect(isViewing()).toBe(false)
    expect(getViewedCommit()).toBeNull()
    expect(getViewedContent('f1')).toBeNull()
    expect(getViewedFileIds()).toEqual([])
  })

  it('enter sets the viewed commit + per-file content', () => {
    enterRuntimeView('c1', { f1: 'live one', f2: 'live two' })
    expect(isViewing()).toBe(true)
    expect(getViewedCommit()).toBe('c1')
    expect(getViewedContent('f1')).toBe('live one')
    expect(getViewedContent('f2')).toBe('live two')
    expect(getViewedFileIds().sort()).toEqual(['f1', 'f2'])
  })

  it('returns null for a file absent at the viewed commit (caller falls back to live)', () => {
    enterRuntimeView('c1', { f1: 'only one' })
    expect(getViewedContent('f2')).toBeNull()
  })

  it('distinguishes an empty-string file from an absent file', () => {
    enterRuntimeView('c1', { f1: '' })
    expect(getViewedContent('f1')).toBe('') // present but empty
    expect(getViewedContent('missing')).toBeNull()
  })

  it('snapshots the files map (later external mutation does not leak in)', () => {
    const files: Record<string, string> = { f1: 'a' }
    enterRuntimeView('c1', files)
    files.f1 = 'mutated'
    files.f2 = 'added'
    expect(getViewedContent('f1')).toBe('a')
    expect(getViewedContent('f2')).toBeNull()
  })

  it('enter again swaps the view in place', () => {
    enterRuntimeView('c1', { f1: 'one' })
    enterRuntimeView('c2', { f1: 'two' })
    expect(getViewedCommit()).toBe('c2')
    expect(getViewedContent('f1')).toBe('two')
  })

  it('exit clears the override fully', () => {
    enterRuntimeView('c1', { f1: 'one' })
    exitRuntimeView()
    expect(isViewing()).toBe(false)
    expect(getViewedCommit()).toBeNull()
    expect(getViewedContent('f1')).toBeNull()
  })

  it('notifies subscribers on enter / swap / exit, and unsubscribe stops it', () => {
    let n = 0
    const unsub = subscribeToRuntimeView(() => { n += 1 })
    enterRuntimeView('c1', { f1: 'one' }) // 1
    enterRuntimeView('c2', { f1: 'two' }) // 2
    exitRuntimeView()                     // 3
    expect(n).toBe(3)
    unsub()
    enterRuntimeView('c3', { f1: 'three' })
    expect(n).toBe(3)
  })

  it('exit when not viewing does not notify', () => {
    let n = 0
    subscribeToRuntimeView(() => { n += 1 })
    exitRuntimeView()
    expect(n).toBe(0)
  })
})
