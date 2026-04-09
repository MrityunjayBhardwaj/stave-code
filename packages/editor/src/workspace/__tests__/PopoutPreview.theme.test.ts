/**
 * PopoutPreview theme fix tests — Phase 10.2 Task 07 (S3).
 *
 * Verifies that `usePopoutPreview` calls `applyTheme` on the popup container
 * and does NOT hardcode `#090912` as the background color.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('PopoutPreview theme fix (S3)', () => {
  const filePath = path.resolve(
    __dirname,
    '../../visualizers/editor/PopoutPreview.tsx',
  )
  const source = fs.readFileSync(filePath, 'utf-8')

  it('imports applyTheme from the theme module', () => {
    expect(source).toContain("import { applyTheme }")
  })

  it('calls applyTheme on the container', () => {
    expect(source).toContain('applyTheme(container, theme)')
  })

  it('does not hardcode #090912 as a direct background assignment', () => {
    // The source should NOT contain the old hardcoded line.
    // It may still appear as a fallback in a conditional expression, but
    // the direct `popup.document.body.style.background = '#090912'` line
    // that was the original hardcode must be gone.
    const hardcodedLine = "popup.document.body.style.background = '#090912'"
    expect(source).not.toContain(hardcodedLine)
  })

  it('accepts a theme prop in the PopoutPreviewProps interface', () => {
    expect(source).toContain("theme?: 'dark' | 'light'")
  })
})
