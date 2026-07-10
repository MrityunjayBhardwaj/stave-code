// #849 — structural Strudel syntax highlighting: every call is colored by
// SHAPE (not from a fixed vocabulary), so controls absent from the curated
// docs index still highlight, while comments/keywords keep priority.
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(300)
}

// Read the ACTUAL Monarch token types the editor assigns, keyed by token text.
async function tokenTypes(page: Page, code: string): Promise<Array<{ text: string; type: string }>> {
  return page.evaluate((src) => {
    const monaco = (window as unknown as { monaco: { editor: { tokenize: (t: string, l: string) => Array<Array<{ offset: number; type: string }>> } } }).monaco
    const lines = src.split('\n')
    const out: Array<{ text: string; type: string }> = []
    monaco.editor.tokenize(src, 'strudel').forEach((lineTokens, i) => {
      const line = lines[i] ?? ''
      lineTokens.forEach((t, j) => {
        const end = j + 1 < lineTokens.length ? lineTokens[j + 1].offset : line.length
        out.push({ text: line.slice(t.offset, end), type: t.type })
      })
    })
    return out
  }, code)
}

test('colors controls absent from the docs vocab, keeps comments/mini intact', async ({ page }) => {
  await boot(page)
  const code = [
    '$: s("bd*2 hh").crush(4).size(0.8).lpf(800)',
    '  .coarse(2).delaytime(0.25)',
    'note("c3 e3 g3") // gain(0.5) in a comment',
  ].join('\n')
  await setStrudelCode(page, code)
  const tokens = await tokenTypes(page, code)
  const typeOf = (text: string): string | undefined => tokens.find((t) => t.text === text)?.type

  // Controls NOT in the 57-entry docs vocab must still be colored as functions.
  for (const ctrl of ['crush', 'size', 'coarse', 'delaytime']) {
    expect(typeOf(ctrl), `${ctrl} should be strudel.function`).toContain('strudel.function')
  }
  // Bare calls too.
  expect(typeOf('s')).toContain('strudel.function')
  expect(typeOf('note')).toContain('strudel.function')
  // Mini-notation inside strings is unaffected.
  expect(typeOf('bd')).toContain('strudel.mini.note')
  // Comments keep priority: `gain(` inside a comment is NOT a function.
  expect(tokens.find((t) => t.text.includes('gain'))?.type).toContain('comment')
})
