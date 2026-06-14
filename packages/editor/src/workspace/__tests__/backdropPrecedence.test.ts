import { describe, it, expect } from 'vitest'
import { resolveBackdropFileId } from '../backdropPrecedence'

describe('resolveBackdropFileId (#350a per-pane precedence)', () => {
  it('shows nothing when neither layer is set', () => {
    expect(resolveBackdropFileId(undefined, undefined)).toBeUndefined()
  })

  it('shows the manual sticky when there is no code override', () => {
    expect(resolveBackdropFileId('sticky-file', undefined)).toBe('sticky-file')
  })

  it('code override wins over the manual sticky', () => {
    expect(resolveBackdropFileId('sticky-file', 'override-file')).toBe('override-file')
  })

  it('code override shows even with no sticky underneath', () => {
    expect(resolveBackdropFileId(undefined, 'override-file')).toBe('override-file')
  })

  it('dropping the override (undefined) reveals the sticky again — NOT a wipe', () => {
    // The behavior flip at the heart of #350a: when the active program stops
    // declaring a backdrop, the user's manual sticky resurfaces instead of the
    // backdrop going blank (the pre-#350 single-slot model cleared it).
    const sticky = 'user-pinned'
    expect(resolveBackdropFileId(sticky, 'code-scope')).toBe('code-scope') // code playing
    expect(resolveBackdropFileId(sticky, undefined)).toBe(sticky) // code removed → sticky back
  })
})
