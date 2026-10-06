import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  boundaryProblems,
  entryImportsInside,
  exceptionsOnMain,
  listProblems,
  loadExceptions,
  measureBoundary,
  REPO_ROOT,
  EDITOR_PACKAGE_JSON,
  shrinkOnlyProblems,
  type ExceptionList,
  type Measurement,
  type Reach,
} from '../boundary'

const E = 'packages/editor/src'
const PANELS = `${E}/visualEdit/panels`
const exists = (rel: string): boolean => fs.existsSync(path.join(REPO_ROOT, rel))
/** throw the WHOLE list — `toEqual([])` truncates it, and the message is the instruction */
const none = (problems: string[], what: string): void => {
  if (problems.length) throw new Error(`${what} (${problems.length}):\n  ${problems.join('\n  ')}`)
}

describe('the code↔view boundary (#1879)', () => {
  describe('the tree as it is', () => {
    let measured: Measurement
    let list: ExceptionList
    beforeAll(() => {
      measured = measureBoundary()
      list = loadExceptions()
    }, 120_000)

    it('the exception list is well formed, and every file it names exists', () => {
      none(listProblems(list, exists), 'boundary.exceptions.json is malformed')
    })

    it('every reach across the boundary has an exception, and every exception still has its reach', () => {
      const enforcedReaches = list.enforced.reduce((n, e) => n + e.reaches.length, 0)
      // said on every run, zero included: the declared files are NOT checked by anything here
      console.info(
        `code↔view boundary: examined ${measured.examined} product files outside codeView/; ` +
          `${measured.reaches.length} reaches measured, ${enforcedReaches} excepted in ${list.enforced.length} files; ` +
          `${list.declared.length} more files declared and NOT enforced`,
      )
      expect(measured.examined, 'no files were examined — the walk is broken, not the boundary clean').toBeGreaterThan(300)
      none(boundaryProblems(measured.reaches, list), 'the code↔view boundary is crossed')
    })

    it("the list only shrinks against origin/main's", () => {
      const main = exceptionsOnMain()
      if (main.kind === 'absent') {
        // Legitimate until the change that introduces the list has merged — and that includes
        // branches stacked on it, whose entries may already carry "added" lines (#1884 was the
        // first). So this cannot fail; it says, every run, that the check did not happen.
        const added = [...list.enforced, ...list.declared].filter((e) => e.added !== undefined).map((e) => e.file)
        console.warn(
          `code↔view boundary: no exception list on origin/main, so shrink-only was NOT checked in this run` +
            (added.length ? ` (${added.length} entries carry "added" lines: ${added.join(', ')})` : ''),
        )
        return
      }
      none(shrinkOnlyProblems(list, main.list), 'the exception list grew')
    })
  })

  describe('inside the area', () => {
    it('no file imports the entry — a file inside imports the module that has the name', () => {
      none(entryImportsInside(), 'files inside codeView/ import codeView/index.ts')
    })

    it('a planted one is caught, however the entry is spelled', () => {
      const C = `${E}/codeView`
      const planted = {
        [`${C}/plantedDot.ts`]: `import { parseStepGrid } from '.'\nexport const x = parseStepGrid`,
        [`${C}/mixer/plantedUp.ts`]: `import type { ChunkInfo } from '..'\nexport type X = ChunkInfo`,
        [`${C}/mixer/plantedIndex.ts`]: `export { detectChunk } from '../index'`,
        [`${C}/mixer/plantedDynamic.ts`]: `export const x = () => import('../index')`,
        [`${C}/mixer/plantedSibling.ts`]: `import { detectChunk } from '../chunkDetect'\nexport const x = detectChunk`,
      }
      expect(entryImportsInside({ overlay: planted })).toEqual([
        `${C}/mixer/plantedDynamic.ts`,
        `${C}/mixer/plantedIndex.ts`,
        `${C}/mixer/plantedUp.ts`,
        `${C}/plantedDot.ts`,
      ])
    })
  })

  // Each planted file is judged alone (`onlyOverlay`): the red state of every rule is reached
  // inside this suite, on a file that does not exist on disk.
  describe('planted crossings', () => {
    const planted: Record<string, string> = {
      // ── rule: import ──
      [`${PANELS}/plantedDeep.tsx`]: `import { parseStepGrid } from '../../codeView/notation/parse'\nexport const x = parseStepGrid`,
      [`${PANELS}/plantedEntry.tsx`]: `import { parseStepGrid } from '../../codeView'\nexport const x = parseStepGrid`,
      [`${PANELS}/plantedDeepType.tsx`]: `import type { StepGridModel } from '../../codeView/notation/model'\nexport type X = StepGridModel`,
      [`${PANELS}/plantedDynamic.tsx`]: `export const x = () => import('../../codeView/notation/serialize')`,
      [`${PANELS}/plantedStar.tsx`]: `export * from '../../codeView/arrange'`,
      [`${PANELS}/plantedRequire.tsx`]: `declare const require: (s: string) => unknown\nexport const x = require('../../codeView/notation/parse')`,
      [`${PANELS}/plantedImportType.tsx`]: `export type T = import('../../codeView/notation/model').StepGridModel`,
      // the package itself has no subpath into the area any more (#1943); this arm plants one
      // in an overlaid package.json (below), so the rule is still reached
      [`packages/app/src/components/plantedSubpath.ts`]: `import { splitMuteMarker } from '@stave/editor/plantedTrackId'\nexport const x = splitMuteMarker`,
      // ── rule: owner ──
      [`${PANELS}/plantedMini.tsx`]: `import { mini } from '@strudel/mini'\nexport const x = mini`,
      [`${PANELS}/plantedKrill.tsx`]: `import * as krill from '@strudel/mini/krill-parser.js'\nexport const x = krill`,
      [`${PANELS}/plantedAcorn.tsx`]: `import { parse } from 'acorn'\nexport const x = parse`,
      [`${E}/engine/plantedEngineMini.ts`]: `import { mini } from '@strudel/mini'\nexport const x = mini`,
      // ── rule: door ──
      // the real shape: no import of the writer at all, it arrives as a callback parameter
      [`${PANELS}/plantedDoorCallback.tsx`]:
        `import { useActiveChunk } from './useActiveChunk'\n` +
        `export function useIt() { const { applyEdit } = useActiveChunk(); return () => applyEdit((fresh, wb) => { wb.replaceRanges([{ range: fresh.miniRange!, text: 'x' }], 'seq') }) }`,
      [`${PANELS}/plantedDoorElement.tsx`]: `import type { Writeback } from '../../codeView'\nexport const f = (wb: Writeback) => wb['beginGesture']()`,
      [`${PANELS}/plantedDoorDestructure.tsx`]: `import type { Writeback } from '../../codeView'\nexport const f = (wb: Writeback) => { const { currentSource } = wb; return currentSource }`,
      [`${PANELS}/plantedDoorAlias.tsx`]: `import { Writeback as W } from '../../codeView'\nexport const f = (e: never, m: never) => new W(e, m)`,
      [`${PANELS}/plantedDoorPassed.tsx`]: `import { Writeback } from '../../codeView'\nexport const f = (g: (c: unknown) => void) => g(Writeback)`,
      [`${PANELS}/plantedDoorApplyEdits.tsx`]: `import { applyEdits } from '../../codeView'\nexport const f = () => applyEdits('abc', [{ range: [0, 1], text: 'x' }])`,
      [`packages/app/src/components/plantedDoorApp.ts`]: `import { applyEdits } from '@stave/editor'\nexport const f = () => applyEdits('abc', [])`,
      [`packages/app/src/components/plantedDoorNamespace.ts`]: `import * as Ed from '@stave/editor'\nexport const f = () => Ed.applyEdits('abc', [])`,
      // a raw Monaco document write, behind the door's back (#1914) — on the model, on the
      // editor, by element access, by destructuring, and from the app
      [`${PANELS}/plantedRawModel.tsx`]: `import type * as Monaco from 'monaco-editor'\nexport const f = (m: Monaco.editor.ITextModel) => { m.setValue('x'); m.pushEditOperations([], [], () => null); m.applyEdits([]) }`,
      [`${PANELS}/plantedRawEditor.tsx`]: `import type * as Monaco from 'monaco-editor'\nexport const f = (e: Monaco.editor.IStandaloneCodeEditor) => { e.executeEdits('me', []); e.setValue('x') }`,
      [`${PANELS}/plantedRawElement.tsx`]: `import type * as Monaco from 'monaco-editor'\nexport const f = (e: Monaco.editor.ICodeEditor) => e['executeCommands']('me', [])`,
      [`${PANELS}/plantedRawDestructure.tsx`]: `import type * as Monaco from 'monaco-editor'\nexport const f = (m: Monaco.editor.ITextModel) => { const { setValue } = m; return setValue }`,
      [`packages/app/src/components/plantedRawApp.ts`]: `import type * as Monaco from 'monaco-editor'\nexport const f = (m: Monaco.editor.ITextModel) => m.setValue('x')`,
      // ── must NOT fire ──
      // Monaco reads, and a form field's own setValue / pushEditOperations
      [`${PANELS}/plantedRawLookalike.tsx`]:
        `import type * as Monaco from 'monaco-editor'\nexport const f = (m: Monaco.editor.ITextModel, e: Monaco.editor.ICodeEditor) => [m.getValue(), e.getValue(), e.getModel()]\n` +
        `class Field { setValue(_v: string): void {} pushEditOperations(): void {} }\nexport const g = () => { const x = new Field(); x.setValue('a'); x.pushEditOperations() }\n` +
        // the same interface name and method, declared here rather than by Monaco
        `interface ITextModel { setValue(v: string): void }\nexport const h = (m: ITextModel) => m.setValue('a')`,
      [`${PANELS}/plantedTypeOnly.tsx`]: `import type { Writeback, OffsetEdit } from '../../codeView'\nexport type Apply = (m: (wb: Writeback) => void, e: OffsetEdit) => void`,
      [`${PANELS}/plantedLookalike.tsx`]:
        `class Mine { replaceRanges(): void {} insertAt(): void {} }\nexport const f = () => { const m = new Mine(); m.replaceRanges(); m.insertAt() }\n` +
        `export function applyEdits(): void {}\nexport const g = () => applyEdits()`,
    }
    let by: Map<string, Reach[]>
    const of = (name: string): string[] => {
      const key = Object.keys(planted).find((f) => f.endsWith(`/${name}`))
      if (!key) throw new Error(`no planted file ${name}`)
      return (by.get(key) ?? []).map((r) => r.reach)
    }
    // The real package.json plus one planted subpath built from a file in the area. Not in
    // `planted`: it is configuration the scan reads, not a file it judges.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, EDITOR_PACKAGE_JSON), 'utf8'))
    const plantedPackageJson = JSON.stringify({
      ...pkg,
      exports: { ...pkg.exports, './plantedTrackId': { import: './dist/codeView/ir/trackId.js' } },
    })
    beforeAll(() => {
      const m = measureBoundary({ overlay: { ...planted, [EDITOR_PACKAGE_JSON]: plantedPackageJson }, onlyOverlay: true })
      expect(m.examined).toBe(Object.keys(planted).length)
      by = new Map()
      for (const r of m.reaches) by.set(r.file, [...(by.get(r.file) ?? []), r])
    }, 120_000)

    it('a deep import is a crossing — value, type-only, dynamic, and export-star alike', () => {
      expect(of('plantedDeep.tsx')).toEqual(['codeView/notation/parse#parseStepGrid'])
      expect(of('plantedDeepType.tsx')).toEqual(['codeView/notation/model#StepGridModel'])
      expect(of('plantedDynamic.tsx')).toEqual(['codeView/notation/serialize#*'])
      expect(of('plantedStar.tsx')).toEqual(['codeView/arrange/index#*'])
      expect(of('plantedRequire.tsx')).toEqual(['codeView/notation/parse#*'])
      expect(of('plantedImportType.tsx')).toEqual(['codeView/notation/model#*'])
    })

    it('the same name through the entry is not', () => {
      expect(of('plantedEntry.tsx')).toEqual([])
    })

    it('a package subpath that is built from a file in the area is a deep import', () => {
      expect(of('plantedSubpath.ts')).toEqual(['codeView/ir/trackId#splitMuteMarker'])
    })

    it('an owner import outside the area is a crossing — and the engine is exempt', () => {
      expect(of('plantedMini.tsx')).toEqual(['owner#@strudel/mini'])
      expect(of('plantedKrill.tsx')).toEqual(['owner#@strudel/mini/krill-parser.js'])
      expect(of('plantedAcorn.tsx')).toEqual(['owner#acorn'])
      expect(of('plantedEngineMini.ts')).toEqual([])
    })

    it('a direct write is a crossing even with no import of the writer in sight', () => {
      expect(of('plantedDoorCallback.tsx')).toEqual(['door#Writeback.replaceRanges'])
    })

    it('…and by element access, destructuring, an aliased constructor, the class passed as a value', () => {
      expect(of('plantedDoorElement.tsx')).toEqual(['door#Writeback.beginGesture'])
      expect(of('plantedDoorDestructure.tsx')).toEqual(['door#Writeback.currentSource'])
      expect(of('plantedDoorAlias.tsx')).toEqual(['door#new Writeback'])
      expect(of('plantedDoorPassed.tsx')).toEqual(['door#Writeback as a value'])
    })

    it('…and through the door functions, from the editor and from the app', () => {
      expect(of('plantedDoorApplyEdits.tsx')).toEqual(['door#applyEdits'])
      expect(of('plantedDoorApp.ts')).toEqual(['door#applyEdits'])
      expect(of('plantedDoorNamespace.ts')).toEqual(['door#applyEdits'])
    })

    it('a raw Monaco document write is a crossing — model, editor, element access, destructuring, app (#1914)', () => {
      expect(of('plantedRawModel.tsx')).toEqual([
        'door#monaco ITextModel.applyEdits',
        'door#monaco ITextModel.pushEditOperations',
        'door#monaco ITextModel.setValue',
      ])
      expect(of('plantedRawEditor.tsx')).toEqual(['door#monaco ICodeEditor.executeEdits', 'door#monaco ICodeEditor.setValue'])
      expect(of('plantedRawElement.tsx')).toEqual(['door#monaco ICodeEditor.executeCommands'])
      expect(of('plantedRawDestructure.tsx')).toEqual(['door#monaco ITextModel.setValue'])
      expect(of('plantedRawApp.ts')).toEqual(['door#monaco ITextModel.setValue'])
    })

    it('a Monaco READ is not a write, and a setValue Monaco did not declare is not the door', () => {
      expect(of('plantedRawLookalike.tsx')).toEqual([])
    })

    it('naming the writer as a TYPE is not a write, and a look-alike method on another class is not the door', () => {
      expect(of('plantedTypeOnly.tsx')).toEqual([])
      expect(of('plantedLookalike.tsx')).toEqual([])
    })

    it('every planted crossing fails the gate, with the instruction for its rule', () => {
      const list = loadExceptions()
      const reaches = [...by.values()].flat()
      const problems = boundaryProblems(reaches, { ...list, enforced: [] })
      expect(problems).toHaveLength(reaches.length)
      expect(problems.find((p) => p.includes('plantedDeep.tsx'))).toMatch(/Import it from codeView\/index\.ts/)
      expect(problems.find((p) => p.includes('plantedMini.tsx'))).toMatch(/parser owners/)
      expect(problems.find((p) => p.includes('plantedDoorCallback.tsx'))).toMatch(/Only codeView\/ writes to the document/)
    })

    it('a THIRD reach from the engine is red — its entry covers exactly the two it names', () => {
      const file = `${E}/engine/StrudelEngine.ts`
      const real = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')
      const m = measureBoundary({ overlay: { [file]: `import { parseMini } from '../codeView/ir/parseMini'\n${real}` }, onlyOverlay: true })
      const mine = boundaryProblems(m.reaches, loadExceptions()).filter((p) => p.startsWith(file))
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatch(/reaches codeView\/ir\/parseMini#parseMini \(import\) and no exception allows it/)
    }, 120_000)
  })

  describe('the list against what is measured', () => {
    const reach = (file: string, r: string): Reach => ({ file, rule: 'import', reach: r })
    const list = (enforced: ExceptionList['enforced'], declared: ExceptionList['declared'] = []): ExceptionList => ({ about: 'a', enforced, declared })
    const entry = (file: string, reaches: string[], extra: object = {}) => ({ file, reaches, why: 'w', issue: '#1880', ...extra })

    it('passes when the two agree exactly', () => {
      expect(boundaryProblems([reach('a.ts', 'codeView/x#y')], list([entry('a.ts', ['codeView/x#y'])]))).toEqual([])
    })

    it('a reach in a file with no entry is red', () => {
      expect(boundaryProblems([reach('a.ts', 'codeView/x#y')], list([]))).toHaveLength(1)
    })

    it('one more reach from a file that HAS an entry is red', () => {
      const p = boundaryProblems([reach('a.ts', 'codeView/x#y'), reach('a.ts', 'codeView/x#z')], list([entry('a.ts', ['codeView/x#y'])]))
      expect(p).toHaveLength(1)
      expect(p[0]).toMatch(/codeView\/x#z/)
    })

    it('a stale entry is red — the reach is gone and the entry stayed', () => {
      const p = boundaryProblems([reach('a.ts', 'codeView/x#y')], list([entry('a.ts', ['codeView/x#y', 'codeView/x#z'])]))
      expect(p).toHaveLength(1)
      expect(p[0]).toMatch(/codeView\/x#z is STALE/)
      expect(boundaryProblems([], list([entry('a.ts', ['codeView/x#y'])]))[0]).toMatch(/STALE/)
    })

    it("an entry does not cover another file's reach", () => {
      expect(boundaryProblems([reach('b.ts', 'codeView/x#y')], list([entry('a.ts', ['codeView/x#y'])]))).toHaveLength(2)
    })
  })

  describe("the list's own shape", () => {
    const ok = { file: 'a.ts', reaches: ['codeView/x#y'], why: 'w', issue: '#1880' }
    const shape = (e: object, declared: object[] = []): string[] =>
      listProblems({ about: 'a', enforced: [e as never], declared: declared as never }, (f) => f === 'a.ts')

    it('accepts a well-formed entry', () => {
      expect(shape(ok)).toEqual([])
    })

    it('refuses an entry that names no issue, or more than a bare issue number', () => {
      expect(shape({ ...ok, issue: '' })).toHaveLength(1)
      expect(shape({ ...ok, issue: 'later' })).toHaveLength(1)
      expect(shape({ ...ok, issue: '#1880 and friends' })).toHaveLength(1)
    })

    it('refuses a missing why, no reaches, a reach twice, a file twice, a file that is gone', () => {
      expect(shape({ ...ok, why: '' })).toHaveLength(1)
      expect(shape({ ...ok, reaches: [] })).toHaveLength(1)
      expect(shape({ ...ok, reaches: ['codeView/x#y', 'codeView/x#y'] })).toHaveLength(1)
      expect(listProblems({ about: 'a', enforced: [ok, ok], declared: [] }, () => true)).toHaveLength(1)
      expect(shape({ ...ok, file: 'gone.ts' })).toHaveLength(1)
    })

    it('refuses an "added" line that names no issue, is not keyed by reach, or names a reach the entry lacks', () => {
      expect(shape({ ...ok, added: { 'codeView/x#y': 'needed it' } })).toHaveLength(1)
      expect(shape({ ...ok, added: { 'codeView/x#y': '#1880 the grid needs it until the op moves in' } })).toEqual([])
      expect(shape({ ...ok, added: '#1880 one line for the whole entry' })).toHaveLength(1)
      expect(shape({ ...ok, added: { 'codeView/x#elsewhere': '#1880 not a reach of this entry' } })).toHaveLength(1)
      expect(shape(ok, [{ file: 'a.ts', what: 'w', issue: '#1880', added: 'later' }])).toHaveLength(1)
    })

    it('holds the declared section to the same shape', () => {
      expect(shape(ok, [{ file: 'a.ts', what: 'reads by hand', issue: '#1880' }])).toEqual([])
      expect(shape(ok, [{ file: 'a.ts', what: '', issue: '#1880' }])).toHaveLength(1)
      expect(shape(ok, [{ file: 'gone.ts', what: 'w', issue: '#1880' }])).toHaveLength(1)
    })
  })

  describe('shrink-only against origin/main', () => {
    const base: ExceptionList = { about: 'a', enforced: [{ file: 'a.ts', reaches: ['codeView/x#y', 'codeView/x#z'], why: 'w', issue: '#1880' }], declared: [{ file: 'd.ts', what: 'w', issue: '#1880' }] }

    it('accepts the same list, a dropped reach, a dropped file', () => {
      expect(shrinkOnlyProblems(base, base)).toEqual([])
      expect(shrinkOnlyProblems({ ...base, enforced: [{ ...base.enforced[0], reaches: ['codeView/x#y'] }] }, base)).toEqual([])
      expect(shrinkOnlyProblems({ ...base, enforced: [], declared: [] }, base)).toEqual([])
    })

    it('refuses a new reach on an existing entry, and a new file, without an "added" line', () => {
      const more = { ...base.enforced[0], reaches: [...base.enforced[0].reaches, 'codeView/x#new'] }
      expect(shrinkOnlyProblems({ ...base, enforced: [more] }, base)).toHaveLength(1)
      const other = { file: 'b.ts', reaches: ['door#Writeback.replaceRanges'], why: 'w', issue: '#1880' }
      expect(shrinkOnlyProblems({ ...base, enforced: [...base.enforced, other] }, base)).toHaveLength(1)
      expect(shrinkOnlyProblems({ ...base, declared: [...base.declared, { file: 'e.ts', what: 'w', issue: '#1880' }] }, base)).toHaveLength(1)
    })

    it('accepts them once the entry says which issue let them in', () => {
      const more = { ...base.enforced[0], reaches: [...base.enforced[0].reaches, 'codeView/x#new'], added: { 'codeView/x#new': '#1880 needed until the op moves in' } }
      expect(shrinkOnlyProblems({ ...base, enforced: [more] }, base)).toEqual([])
      expect(shrinkOnlyProblems({ ...base, declared: [...base.declared, { file: 'e.ts', what: 'w', issue: '#1880', added: '#1880 found while moving the mixer' }] }, base)).toEqual([])
    })

    it('one "added" line does not cover the NEXT new reach on the same entry', () => {
      const two = {
        ...base.enforced[0],
        reaches: [...base.enforced[0].reaches, 'codeView/x#new', 'codeView/x#newer'],
        added: { 'codeView/x#new': '#1880 needed until the op moves in' },
      }
      const p = shrinkOnlyProblems({ ...base, enforced: [two] }, base)
      expect(p).toHaveLength(1)
      expect(p[0]).toMatch(/codeView\/x#newer is not on origin\/main's list/)
    })
  })
})
