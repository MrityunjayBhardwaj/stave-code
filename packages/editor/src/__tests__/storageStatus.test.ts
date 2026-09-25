import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetStorageStatusForTests,
  getStorageStatus,
  noteDocumentReplaced,
  noteDocumentSaved,
  noteStorageRefused,
  subscribeStorageStatus,
} from '../storageStatus'

beforeEach(() => __resetStorageStatusForTests())

describe('storageStatus (#1778)', () => {
  it('starts clear', () => {
    expect(getStorageStatus()).toEqual({ fullSince: null, documentUnsaved: false })
  })

  it('a refused document write marks the disk full and the document behind', () => {
    noteStorageRefused({ document: true })
    const s = getStorageStatus()
    expect(s.documentUnsaved).toBe(true)
    expect(typeof s.fullSince).toBe('number')
  })

  it('a refused write that is not the document leaves the document saved', () => {
    noteStorageRefused()
    expect(getStorageStatus().documentUnsaved).toBe(false)
  })

  it('keeps the FIRST refusal time — "not saved since" must not move forward', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    noteStorageRefused({ document: true })
    vi.setSystemTime(9_000)
    noteStorageRefused({ document: true })
    vi.useRealTimers()
    expect(getStorageStatus().fullSince).toBe(1_000)
  })

  it('only a committed full-document save clears it', () => {
    noteStorageRefused({ document: true })
    noteDocumentSaved()
    expect(getStorageStatus()).toEqual({ fullSince: null, documentUnsaved: false })
  })

  it('opening another document clears "behind" but not "full"', () => {
    noteStorageRefused({ document: true })
    noteDocumentReplaced()
    const s = getStorageStatus()
    expect({ unsaved: s.documentUnsaved, full: s.fullSince !== null }).toEqual({
      unsaved: false,
      full: true,
    })
  })

  it('notifies on change only, with a stable snapshot between changes', () => {
    const fn = vi.fn()
    subscribeStorageStatus(fn)
    const before = getStorageStatus()
    noteDocumentSaved() // already clear: no change
    expect(getStorageStatus()).toBe(before)
    noteStorageRefused({ document: true })
    noteStorageRefused({ document: true }) // same state again
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
