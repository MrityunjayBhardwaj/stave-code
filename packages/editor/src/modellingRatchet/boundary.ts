/**
 * The code↔view boundary (#1879, part of #1869, epic #1007).
 *
 * One directory, `editor/src/codeView/`, is the only valid path from code to what a view
 * draws and from a gesture back to code. A rule like that cannot be enforced by recognising
 * what conversion code LOOKS like — a detector of hand-written grammar is itself a grammar,
 * and is never complete (#1871 was closed for it). So this measures STRUCTURE, three ways,
 * for every product file outside the area:
 *
 *   import — it imports something in `codeView/` other than the entry, `codeView/index.ts`
 *            (a package subpath such as `@stave/editor/trackId` counts: it is a bundle
 *            entry that points into the area)
 *   owner  — it imports krill, `@strudel/mini` or acorn (`engine/` is exempt: it runs Strudel)
 *   door   — it touches the write door: a member of `Writeback`, the class as a value,
 *            or `applyEdits` — or it writes the document behind the door's back, through
 *            one of Monaco's own document writes (`ITextModel.setValue`, `pushEditOperations`,
 *            `applyEdits`; `ICodeEditor.setValue`, `executeEdits`, `executeCommand(s)`), #1914.
 *            Asked of the TYPE CHECKER, because the import lines do not show it: a panel
 *            calls `wb.replaceRanges` on a callback parameter and never imports `Writeback`
 *            at all, and a `setValue` is the door only when Monaco declared it.
 *
 * Each thing found is a REACH, named by symbol and never by line, so an entry does not go
 * stale when a file is edited above it. `boundary.exceptions.json` lists the reaches that
 * exist today; `boundaryProblems` compares the two and both directions are failures — a
 * reach with no entry, and an entry whose reach is gone.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────────────────
 * Structure only. A file that reads user code by hand (a regex over the document) or builds
 * replacement text and RETURNS it to a caller crosses no import and touches no door, so no
 * rule here fires. Those files are listed under `declared` — named, counted on every run,
 * and not enforced. A receiver typed `any` is invisible to the door rule for the same reason.
 * So is a Monaco write that is not a document-write method: `editor.trigger(…, 'type', …)`,
 * undo/redo, or a keystroke — `trigger` also runs every editor action, so naming it would
 * flag the play/stop shortcuts, not writes. And so is a write a LIBRARY makes on a prop's
 * behalf: `EditorView` passes `value={file.content}` to `@monaco-editor/react`, which replaces
 * the whole document itself when that value changes (#1903). It has to be decided and written
 * down; a symbol rule cannot reach it.
 * The declared list empties as #1880 moves those files in; once nothing outside the area
 * touches the door, text built outside it has no way to reach a document.
 *
 * ── DECIDED: THE ENTRY'S NAMES ARE NOT RATCHETED (2026-10-01, #1869) ─────────────────────
 * Any internal of the area can be exported from `codeView/index.ts` and then imported
 * legally, so the entry can widen without this test noticing. A ratchet on its names was
 * considered and turned down: a view legitimately needs a new op now and then, and a gate
 * that asks for an exemption line on every one teaches people to write exemption lines.
 * What goes into the entry is a review question. Do not add that ratchet here without
 * reopening the decision on #1869.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { textOnMain } from './ratchet'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '../../../..')
export const EXCEPTIONS_PATH = path.join(HERE, 'boundary.exceptions.json')

const EDITOR_SRC = 'packages/editor/src'
const AREA = `${EDITOR_SRC}/codeView/`
const ENTRY = `${AREA}index.ts`
const ENGINE = `${EDITOR_SRC}/engine/`
const PACKAGES = ['packages/editor', 'packages/app'] as const
const DOOR_CLASS = 'Writeback'
const DOOR_FUNCTIONS = new Set(['applyEdits'])
/** Monaco's own document writes, by the interface that declares them (#1914) */
const RAW_WRITES: Record<string, ReadonlySet<string>> = {
  ITextModel: new Set(['setValue', 'pushEditOperations', 'applyEdits']),
  ICodeEditor: new Set(['setValue', 'executeEdits', 'executeCommand', 'executeCommands']),
}

export type Rule = 'import' | 'owner' | 'door'
export interface Reach {
  /** repo-relative path of the file outside the area */
  file: string
  rule: Rule
  /** `codeView/<module>#<name>`, `owner#<specifier>`, `door#<what>` or `door#monaco <Interface>.<method>` */
  reach: string
}
export interface Measurement {
  /** product files outside the area that were examined */
  examined: number
  reaches: Reach[]
}

const toPosix = (p: string): string => p.split(path.sep).join('/')

/** tests, probes and declaration files are not product code; the rules are about product code */
export function isProductFile(rel: string): boolean {
  return (
    /\.(ts|tsx)$/.test(rel) &&
    !/\.d\.ts$/.test(rel) &&
    !/\.(test|spec)\.tsx?$/.test(rel) &&
    !/(^|\/)__tests__\//.test(rel) &&
    !/\/_[^/]*$/.test(rel)
  )
}

function walk(root: string, dir: string, out: string[]): void {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(root, rel, out)
    else if (/\.(ts|tsx)$/.test(rel)) out.push(rel)
  }
}

/** `@stave/editor/<subpath>` → the source file its bundle entry is built from */
function subpathSources(root: string, known: Set<string>): Map<string, string> {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/editor/package.json'), 'utf8')) as {
    name: string
    exports?: Record<string, { import?: string } | string>
  }
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (key === '.') continue
    const target = typeof value === 'string' ? value : value.import
    const m = target && /^\.\/dist\/(.+)\.(?:js|mjs)$/.exec(target)
    if (!m) throw new Error(`boundary: cannot map package subpath ${key} (${JSON.stringify(value)}) back to a source file`)
    const base = `${EDITOR_SRC}/${m[1]}`
    const src = [`${base}.ts`, `${base}.tsx`].find((c) => known.has(c))
    if (!src) throw new Error(`boundary: package subpath ${key} builds from ${base}.ts(x), which does not exist`)
    out.set(`${pkg.name}/${key.slice(2)}`, src)
  }
  return out
}

/**
 * Where the door is declared. The editor's own program sees the source files; the app's
 * sees the editor through its built declarations, where everything is in one bundle.
 */
function isDoorHome(file: string): boolean {
  if (/\/packages\/editor\/dist\/[^/]+\.d\.(ts|cts|mts)$/.test(file)) return true
  return file.endsWith(`/${AREA}writeback.ts`)
}

/** where Monaco declares its API — the editor's program and the app's each resolve it there */
const isMonacoHome = (file: string): boolean => /\/node_modules\/monaco-editor\//.test(file)

const isOwnerSpecifier =(spec: string): boolean =>
  spec === '@strudel/mini' || spec.startsWith('@strudel/mini/') || spec.includes('krill-parser') || spec === 'acorn' || /^acorn[-/]/.test(spec)

export interface MeasureOptions {
  root?: string
  /** virtual files (repo-relative path → source), added to or replacing what is on disk */
  overlay?: Record<string, string>
  /** examine ONLY the overlay files — a planted file is judged in seconds, not the whole tree */
  onlyOverlay?: boolean
}

/** Every reach across the boundary, from the tree as it is (plus any overlay). */
export function measureBoundary(opts: MeasureOptions = {}): Measurement {
  const root = opts.root ?? REPO_ROOT
  const overlay = new Map(Object.entries(opts.overlay ?? {}))
  const all: string[] = []
  for (const pkg of PACKAGES) walk(root, `${pkg}/src`, all)
  for (const f of overlay.keys()) if (!all.includes(f)) all.push(f)
  const known = new Set(all)
  const read = (rel: string): string => overlay.get(rel) ?? fs.readFileSync(path.join(root, rel), 'utf8')
  const subject = (rel: string): boolean =>
    isProductFile(rel) && !rel.startsWith(AREA) && (!opts.onlyOverlay || overlay.has(rel))
  const subjects = all.filter(subject).sort()
  const subpaths = subpathSources(root, known)

  const reaches: Reach[] = []
  const seen = new Set<string>()
  const add = (file: string, rule: Rule, reach: string): void => {
    const key = `${file}\n${reach}`
    if (seen.has(key)) return
    seen.add(key)
    reaches.push({ file, rule, reach })
  }

  // ── import + owner: read off each file's own import statements ──────────────
  const resolveRelative = (from: string, spec: string): string | null => {
    const base = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)))
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base.replace(/\.js$/, '.ts')].find((c) => known.has(c)) ?? null
  }
  for (const rel of subjects) {
    const sf = ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const note = (spec: string, names: string[]): void => {
      if (isOwnerSpecifier(spec)) {
        if (!rel.startsWith(ENGINE)) add(rel, 'owner', `owner#${spec}`)
        return
      }
      const target = spec.startsWith('.') ? resolveRelative(rel, spec) : (subpaths.get(spec) ?? null)
      if (!target || !target.startsWith(AREA) || target === ENTRY) return
      const mod = target.slice(EDITOR_SRC.length + 1).replace(/\.tsx?$/, '')
      for (const n of names.length ? names : ['*']) add(rel, 'import', `${mod}#${n}`)
    }
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const names: string[] = []
        const clause = n.importClause
        if (clause?.name) names.push('default')
        const nb = clause?.namedBindings
        if (nb && ts.isNamedImports(nb)) nb.elements.forEach((e) => names.push((e.propertyName ?? e.name).text))
        else if (nb) names.push('*')
        note(n.moduleSpecifier.text, names)
      } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const names: string[] = []
        if (n.exportClause && ts.isNamedExports(n.exportClause)) n.exportClause.elements.forEach((e) => names.push((e.propertyName ?? e.name).text))
        note(n.moduleSpecifier.text, names)
      } else if (ts.isCallExpression(n) && n.arguments.length >= 1 && ts.isStringLiteralLike(n.arguments[0])) {
        // import('…') and require('…')
        const dynamic = n.expression.kind === ts.SyntaxKind.ImportKeyword
        const req = ts.isIdentifier(n.expression) && n.expression.text === 'require'
        if (dynamic || req) note(n.arguments[0].text, [])
      } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
        note(n.argument.literal.text, [])
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }

  // ── door: asked of the type checker, one program per package ────────────────
  for (const pkg of PACKAGES) {
    const srcRoot = `${pkg}/src/`
    const mine = subjects.filter((f) => f.startsWith(srcRoot))
    if (mine.length === 0) continue
    const cfgPath = path.join(root, pkg, 'tsconfig.json')
    const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(`boundary: ${cfgPath}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
      },
    })
    if (!cfg) throw new Error(`boundary: could not read ${cfgPath}`)
    const abs = (rel: string): string => path.join(root, rel)
    const virtual = new Map([...overlay].map(([rel, text]) => [abs(rel), text]))
    const host = ts.createCompilerHost(cfg.options, true)
    const onDisk = { exists: host.fileExists.bind(host), read: host.readFile.bind(host), source: host.getSourceFile.bind(host) }
    host.fileExists = (f) => virtual.has(path.normalize(f)) || onDisk.exists(f)
    host.readFile = (f) => virtual.get(path.normalize(f)) ?? onDisk.read(f)
    host.getSourceFile = (f, lang, ...rest) => {
      const text = virtual.get(path.normalize(f))
      return text === undefined ? onDisk.source(f, lang, ...rest) : ts.createSourceFile(f, text, lang, true)
    }
    const rootNames = opts.onlyOverlay
      ? mine.map(abs)
      : [...new Set([...cfg.fileNames, ...mine.filter((f) => overlay.has(f)).map(abs)])]
    const program = ts.createProgram(rootNames, cfg.options, host)
    const checker = program.getTypeChecker()

    /** what a symbol is, when it is part of the door */
    const doorOf = (sym: ts.Symbol | undefined): { kind: 'member' | 'class' | 'function' | 'raw'; name: string } | null => {
      if (!sym) return null
      const real = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym
      for (const d of real.declarations ?? []) {
        // a raw document write: the method as MONACO declares it, so a form field's own
        // `setValue` is not one (#1914)
        if (isMonacoHome(toPosix(d.getSourceFile().fileName)) && ts.isMethodSignature(d) && ts.isInterfaceDeclaration(d.parent)) {
          if (RAW_WRITES[d.parent.name.text]?.has(real.name)) return { kind: 'raw', name: `${d.parent.name.text}.${real.name}` }
          continue
        }
        // the door by where it is DECLARED, never by its name alone: a panel's own
        // `applyEdits`, or a `replaceRanges` on some other class, is not the door
        if (!isDoorHome(toPosix(d.getSourceFile().fileName))) continue
        if (ts.isClassDeclaration(d) && d.name?.text === DOOR_CLASS) return { kind: 'class', name: DOOR_CLASS }
        if (d.parent && ts.isClassDeclaration(d.parent) && d.parent.name?.text === DOOR_CLASS && ts.isClassElement(d)) {
          return { kind: 'member', name: real.name }
        }
        if ((ts.isFunctionDeclaration(d) || ts.isVariableDeclaration(d)) && DOOR_FUNCTIONS.has(real.name)) {
          return { kind: 'function', name: real.name }
        }
      }
      return null
    }
    const inTypePosition = (n: ts.Node): boolean => {
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (ts.isTypeNode(p) || ts.isExpressionWithTypeArguments(p)) return true
        if (ts.isStatement(p)) return false
      }
      return false
    }
    const isSpecifier = (n: ts.Node): boolean =>
      ts.isImportSpecifier(n.parent) || ts.isExportSpecifier(n.parent) || ts.isImportClause(n.parent) || ts.isNamespaceImport(n.parent)

    for (const rel of mine) {
      const sf = program.getSourceFile(abs(rel))
      if (!sf) throw new Error(`boundary: ${rel} is not in ${pkg}'s program — it would have been skipped, not cleared`)
      const visit = (n: ts.Node): void => {
        const classUse = (at: ts.Node): string =>
          ts.isNewExpression(at.parent) && at.parent.expression === at ? `door#new ${DOOR_CLASS}` : `door#${DOOR_CLASS} as a value`
        if (ts.isPropertyAccessExpression(n)) {
          // `wb.replaceRanges`, and a namespace's `E.applyEdits` / `E.Writeback`
          const d = doorOf(checker.getSymbolAtLocation(n.name))
          if (d?.kind === 'member') add(rel, 'door', `door#${DOOR_CLASS}.${d.name}`)
          else if (d?.kind === 'raw') add(rel, 'door', `door#monaco ${d.name}`)
          else if (d?.kind === 'function') add(rel, 'door', `door#${d.name}`)
          else if (d?.kind === 'class' && !inTypePosition(n)) add(rel, 'door', classUse(n))
        } else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
          const d = doorOf(checker.getTypeAtLocation(n.expression).getProperty(n.argumentExpression.text))
          if (d?.kind === 'member') add(rel, 'door', `door#${DOOR_CLASS}.${d.name}`)
          else if (d?.kind === 'raw') add(rel, 'door', `door#monaco ${d.name}`)
        } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
          // `const { replaceRanges } = wb`
          const key = n.propertyName ?? n.name
          if (ts.isIdentifier(key)) {
            const d = doorOf(checker.getTypeAtLocation(n.parent).getProperty(key.text))
            if (d?.kind === 'member') add(rel, 'door', `door#${DOOR_CLASS}.${d.name}`)
            else if (d?.kind === 'raw') add(rel, 'door', `door#monaco ${d.name}`)
          }
        } else if (
          ts.isIdentifier(n) &&
          !isSpecifier(n) &&
          !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
          !inTypePosition(n)
        ) {
          // every door is declared inside the area or in the built declarations, and
          // neither is measured, so an identifier that resolves to one is always a use
          const d = doorOf(checker.getSymbolAtLocation(n))
          if (d) {
            if (d.kind === 'function') add(rel, 'door', `door#${d.name}`)
            else if (d.kind === 'class') add(rel, 'door', classUse(n))
          }
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
  }

  reaches.sort((a, b) => a.file.localeCompare(b.file) || a.reach.localeCompare(b.reach))
  return { examined: subjects.length, reaches }
}

/**
 * Product files INSIDE the area that import its entry. The entry is the door for the outside;
 * a file inside that walks back in through it makes a cycle (entry → file → entry) and hides
 * which module it really depends on. Inside, a file imports the module that has the name.
 */
export function entryImportsInside(opts: Pick<MeasureOptions, 'root' | 'overlay'> = {}): string[] {
  const root = opts.root ?? REPO_ROOT
  const overlay = new Map(Object.entries(opts.overlay ?? {}))
  const all: string[] = []
  walk(root, EDITOR_SRC, all)
  for (const f of overlay.keys()) if (!all.includes(f)) all.push(f)
  const known = new Set(all)
  const out: string[] = []
  for (const rel of all.filter((f) => f.startsWith(AREA) && f !== ENTRY && isProductFile(f)).sort()) {
    const text = overlay.get(rel) ?? fs.readFileSync(path.join(root, rel), 'utf8')
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (n: ts.Node): void => {
      const spec =
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)
          ? n.moduleSpecifier.text
          : ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])
            ? n.arguments[0].text
            : null
      if (spec?.startsWith('.')) {
        const base = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)))
        if ([base, `${base}.ts`, `${base}/index.ts`].find((c) => known.has(c)) === ENTRY) out.push(rel)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return [...new Set(out)]
}

// ── the exception list ──────────────────────────────────────────────────────

export interface EnforcedException {
  file: string
  /** exactly the reaches this file is allowed; one more is a failure, one fewer is stale */
  reaches: string[]
  why: string
  /** the issue that removes this entry: `#1234` */
  issue: string
  /**
   * Required for each reach `origin/main` does not already list, keyed by THAT reach:
   * `{ "<reach>": "#<issue> <why it was allowed in>" }`. Per reach, not per entry — one
   * line on the entry would wave through every reach added after it.
   */
  added?: Record<string, string>
}
export interface DeclaredException {
  file: string
  /** what it does that no rule can see */
  what: string
  issue: string
  added?: string
}
export interface ExceptionList {
  about: string
  enforced: EnforcedException[]
  declared: DeclaredException[]
}

export function loadExceptions(file: string = EXCEPTIONS_PATH): ExceptionList {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ExceptionList
}

const ISSUE = /^#\d+$/
const ADDED = /^#\d+\b.+/

/** every rule the list's own shape must satisfy — empty when it is well formed */
export function listProblems(list: ExceptionList, fileExists: (rel: string) => boolean): string[] {
  const out: string[] = []
  const check = (section: 'enforced' | 'declared', e: EnforcedException | DeclaredException, i: number): void => {
    const at = `${section}[${i}] ${e.file}`
    if (!fileExists(e.file)) out.push(`${at}: no such file — a moved or deleted file takes its entry with it`)
    if (!ISSUE.test(e.issue)) out.push(`${at}: "issue" must be one issue number (#1234), got ${JSON.stringify(e.issue)}`)
  }
  const addedLine = (at: string, line: unknown): void => {
    if (typeof line !== 'string' || !ADDED.test(line)) out.push(`${at}: an "added" line must start with an issue number and say why, got ${JSON.stringify(line)}`)
  }
  const files = new Set<string>()
  list.enforced.forEach((e, i) => {
    check('enforced', e, i)
    if (e.added !== undefined) {
      if (typeof e.added !== 'object' || e.added === null) out.push(`enforced[${i}] ${e.file}: "added" must map each new reach to its "#<issue> <why>" line`)
      else {
        for (const [reach, line] of Object.entries(e.added)) {
          if (!e.reaches.includes(reach)) out.push(`enforced[${i}] ${e.file}: "added" names ${reach}, which the entry does not list`)
          addedLine(`enforced[${i}] ${e.file} added[${reach}]`, line)
        }
      }
    }
    if (!e.why) out.push(`enforced[${i}] ${e.file}: missing "why"`)
    if (!Array.isArray(e.reaches) || e.reaches.length === 0) out.push(`enforced[${i}] ${e.file}: lists no reaches — delete the entry`)
    else if (new Set(e.reaches).size !== e.reaches.length) out.push(`enforced[${i}] ${e.file}: a reach is listed twice`)
    if (files.has(e.file)) out.push(`enforced[${i}] ${e.file}: a second entry for the same file`)
    files.add(e.file)
  })
  const declared = new Set<string>()
  list.declared.forEach((e, i) => {
    check('declared', e, i)
    if (e.added !== undefined) addedLine(`declared[${i}] ${e.file}`, e.added)
    if (!e.what) out.push(`declared[${i}] ${e.file}: missing "what"`)
    if (declared.has(e.file)) out.push(`declared[${i}] ${e.file}: a second entry for the same file`)
    declared.add(e.file)
  })
  return out
}

/** measured reaches against the list: a reach with no entry, and an entry whose reach is gone */
export function boundaryProblems(measured: Reach[], list: ExceptionList): string[] {
  const out: string[] = []
  const allowed = new Map(list.enforced.map((e) => [e.file, new Set(e.reaches)]))
  const found = new Map<string, Set<string>>()
  for (const r of measured) {
    if (!found.has(r.file)) found.set(r.file, new Set())
    found.get(r.file)!.add(r.reach)
    if (!allowed.get(r.file)?.has(r.reach)) {
      out.push(
        `${r.file} reaches ${r.reach} (${r.rule}) and no exception allows it. ` +
          (r.rule === 'import'
            ? `Import it from codeView/index.ts instead; if the name is not there, add it to the entry.`
            : r.rule === 'owner'
              ? `Only codeView/ (and the engine) may import the parser owners; ask codeView for the answer instead.`
              : `Only codeView/ writes to the document; the op that needs this write belongs in codeView/.`),
      )
    }
  }
  for (const e of list.enforced) {
    for (const reach of e.reaches) {
      if (!found.get(e.file)?.has(reach)) {
        out.push(`${e.file}: the exception for ${reach} is STALE — the file no longer reaches it. Good: delete it from boundary.exceptions.json in the same change.`)
      }
    }
  }
  return out
}

/** every reach or declared file the list has that `base` (origin/main's list) does not, without an `added` line */
export function shrinkOnlyProblems(current: ExceptionList, base: ExceptionList): string[] {
  const out: string[] = []
  const was = new Map(base.enforced.map((e) => [e.file, new Set(e.reaches)]))
  for (const e of current.enforced) {
    const fresh = e.reaches.filter((r) => !was.get(e.file)?.has(r) && e.added?.[r] === undefined)
    if (fresh.length) {
      out.push(`${e.file}: ${fresh.join(', ')} ${fresh.length === 1 ? 'is' : 'are'} not on origin/main's list. The list only shrinks: each new reach needs its own line, "added": { "<reach>": "#<issue> <why>" }, naming an open issue under #1007.`)
    }
  }
  const declaredWas = new Set(base.declared.map((e) => e.file))
  for (const e of current.declared) {
    if (!declaredWas.has(e.file) && e.added === undefined) {
      out.push(`${e.file}: newly declared, and not on origin/main's list. It needs "added": "#<issue> <why>".`)
    }
  }
  return out
}

export type MainExceptions = { kind: 'present'; list: ExceptionList } | { kind: 'absent' }

/** the list as `origin/main` has it; 'absent' only in the change that introduces it */
export function exceptionsOnMain(file: string = EXCEPTIONS_PATH): MainExceptions {
  const text = textOnMain(file)
  return text === null ? { kind: 'absent' } : { kind: 'present', list: JSON.parse(text) as ExceptionList }
}
