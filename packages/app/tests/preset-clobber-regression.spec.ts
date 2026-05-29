import { test, expect, type Page } from '@playwright/test'

// Issue #189 — `StrudelEditorClient.seedPresets` used to `VizPresetStore.put`
// the bundled `code` on every mount, erasing user edits to the bundled
// Piano Roll preset on every reload. The fix: only put when no entry
// exists ("seed-when-missing", matching `seedWorkspaceFile`).
//
// Realistic flow this test exercises:
//   1. Fresh wipe → `seedPresets` creates the bundled entry.
//   2. We edit the workspace file `preset/viz/Piano Roll.p5` via Monaco's
//      model API. The edit lives in Yjs and persists across reloads.
//   3. Reload — on the new mount, `registerAllVizFiles` runs `flushToPreset`,
//      which reads the workspace file (with our marker) and writes it to
//      `VizPresetStore`. Pre-fix, `seedPresets` then clobbered that
//      flushed content back to the bundled `PIANOROLL_P5_CODE`. Post-fix,
//      `seedPresets` is a no-op when the entry exists, so the user's
//      edit survives.
//
// Note: the live-edit propagation (before reload) goes through
// `useVizRefWatcher`, which only fires when an active strudel/sonicpi
// file references the viz. We don't assert on that path — the
// load-bearing contract is "after-reload, VizPresetStore reflects the
// workspace file content," and that's what this test pins.

const VIZ_DB = 'stave-viz-presets'
const VIZ_STORE = 'presets'
const BUNDLED_P5_ID = '__bundled_piano_roll_p5__'
const MARKER = '// USER-EDIT-MARKER-189'

async function wipeAllAppDbs(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(async (vizDb) => {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('stave:')) keys.push(k)
      }
      for (const k of keys) localStorage.removeItem(k)
    } catch {
      // private mode, ignore
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(vizDb)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  }, VIZ_DB)
}

async function readPresetCode(
  page: Page,
  id: string,
): Promise<string | undefined> {
  return page.evaluate(
    ({ db, store, id }) =>
      new Promise<string | undefined>((resolve) => {
        const req = indexedDB.open(db)
        req.onsuccess = () => {
          const d = req.result
          if (!d.objectStoreNames.contains(store)) {
            d.close()
            resolve(undefined)
            return
          }
          const t = d.transaction(store, 'readonly').objectStore(store).get(id)
          t.onsuccess = () => {
            d.close()
            const rec = t.result as { code?: string } | undefined
            resolve(rec?.code)
          }
          t.onerror = () => {
            d.close()
            resolve(undefined)
          }
        }
        req.onerror = () => resolve(undefined)
      }),
    { db: VIZ_DB, store: VIZ_STORE, id },
  )
}

async function editPianoRollViaMonacoModel(
  page: Page,
  marker: string,
): Promise<void> {
  await page.evaluate(async (m) => {
    const w = window as unknown as {
      monaco?: {
        editor?: {
          getModels?: () => Array<{
            getValue: () => string
            setValue: (s: string) => void
          }>
        }
      }
    }
    const deadline = Date.now() + 5000
    while (
      (!w.monaco?.editor?.getModels ||
        w.monaco.editor.getModels().length === 0) &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 100))
    }
    const models = w.monaco?.editor?.getModels?.() ?? []
    const target = models.find((x) =>
      x.getValue().includes('Stave p5 viz — Piano Roll'),
    )
    if (!target) throw new Error('Piano Roll model not loaded')
    target.setValue(m + '\n' + target.getValue())
  }, marker)
}

test.beforeEach(async ({ page }) => {
  await wipeAllAppDbs(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
})

test('user edits to the bundled Piano Roll preset survive a reload', async ({
  page,
}) => {
  // 1. Open Piano Roll.p5 so Monaco loads its model.
  await page
    .locator('[data-file-tree-item]')
    .filter({ hasText: 'Piano Roll.p5' })
    .first()
    .dblclick()
  await page.waitForTimeout(800)

  // 2. Inject the marker via Monaco's model API. The Y.Doc binding picks
  //    it up and persists to IndexedDB.
  await editPianoRollViaMonacoModel(page, MARKER)
  await page.waitForTimeout(800)

  // 3. Reload. Pre-fix this is where `seedPresets` clobbered VizPresetStore
  //    after `registerAllVizFiles` had just populated it from the workspace.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(2500)

  // 4. Load-bearing assertion: VizPresetStore.code retains the user edit
  //    after reload — proving `seedPresets` no longer clobbers.
  const afterReload = await readPresetCode(page, BUNDLED_P5_ID)
  expect(afterReload).toBeDefined()
  expect(afterReload).toContain(MARKER)
})
