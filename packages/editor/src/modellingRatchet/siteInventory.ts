/**
 * The site inventory (#1298, #1866 part 2) — every place in source that COULD be re-modelling
 * Strudel, found by what it is rather than by a list of function names.
 *
 * #1298 found M3 ("emitting Strudel text from a model") defined as a property and then counted
 * as a family of functions, and three emitters sat outside every list. A list someone keeps by
 * hand can only hold what they remembered. So this file DETECTS, with no judgement, and a
 * committed inventory (`inventory.json`) CLASSIFIES each site in the open, where it can be
 * disagreed with — the same division of labour the predicate audit uses for parseStrudel.ts.
 *
 * Two detectors, because each alone was measured to miss real writers:
 *
 *   literal shapes (per site)   a regex literal · a template literal that puts mini syntax
 *                               (`[ < @ * ! ~` before, `] > @ * ! _` after) against a
 *                               substitution · a `+` with a lone syntax character · a string
 *                               of bracket kinds or a comparison with one bracket (the
 *                               bracket-depth scanner) — finds `reemitStep`, `asEntry`,
 *                               `lengthen`'s scanner; MISSES `gridColumns`, `respellBar`,
 *                               `laneString`, which join tokens instead.
 *
 *   model → text (per function) the type checker: a parameter whose type is declared in the
 *                               notation, arrange or IR code, and a result that holds a string
 *                               (directly, in an array, or as a `text`/`mini`/`body`/`code`/
 *                               `source` field) — finds those three; MISSES `reemitStep`,
 *                               whose input is already text.
 *
 * Out of scope here, deliberately: regex literals in `ir/parseStrudel.ts`, which the predicate
 * audit already governs one by one. Tests and declaration files are not product code.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export type Shape = 'regex' | 'template' | 'concat' | 'scanner' | 'model-to-text'

export interface Site {
  /** repo-relative path */
  file: string
  /** the enclosing named function, or `<module>` */
  fn: string
  shape: Shape
  /** the site's own text, whitespace collapsed and capped — empty for model-to-text */
  text: string
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
export const SCANNED_PACKAGES = ['editor', 'app'] as const

/** governed elsewhere: the predicate audit owns every regex literal in this file */
const REGEX_OWNED_BY_PREDICATE_AUDIT = 'packages/editor/src/ir/parseStrudel.ts'

/** where a type counts as a model type */
const MODEL_DIRS = ['packages/editor/src/visualEdit/notation/', 'packages/editor/src/visualEdit/arrange/', 'packages/editor/src/ir/']

const TEXT_FIELDS = new Set(['text', 'mini', 'body', 'code', 'source'])

export const siteKey = (s: Site): string => `${s.file}#${s.fn}|${s.shape}|${s.text}`

const squash = (t: string): string => t.replace(/\s+/g, ' ').trim().slice(0, 160)

const isProductSource = (rel: string): boolean =>
  /\.(ts|tsx)$/.test(rel) && !/\.d\.ts$/.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel) && !/(^|\/)__tests__\//.test(rel)

function enclosingName(node: ts.Node, sf: ts.SourceFile): string {
  for (let p: ts.Node | undefined = node; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText(sf)
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent)) return p.parent.name.getText(sf)
  }
  return '<module>'
}

const SYNTAX_BEFORE = /[[<@*!~]\s*$/
const SYNTAX_AFTER = /^\s*[\]>@*!_]/
const LONE_SYNTAX = /^\s*[[\]<>@*!~]\s*$/
const BRACKET_RUN = /^[[<{(]{2,}$|^[\]>})]{2,}$/
const ONE_BRACKET = /^[[\]<>]$/

/** the literal-shape sites of one source text. Pure, so a planted source can be run through it. */
export function literalSites(rel: string, text: string): Site[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Site[] = []
  const add = (n: ts.Node, shape: Shape, t: string) => out.push({ file: rel, fn: enclosingName(n, sf), shape, text: squash(t) })
  const visit = (n: ts.Node): void => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral && rel !== REGEX_OWNED_BY_PREDICATE_AUDIT) add(n, 'regex', n.getText(sf))
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]
      if (parts.slice(0, -1).some((p, i) => SYNTAX_BEFORE.test(p) || SYNTAX_AFTER.test(parts[i + 1]))) add(n, 'template', n.getText(sf))
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if ([n.left, n.right].some((s) => ts.isStringLiteral(s) && LONE_SYNTAX.test(s.text))) add(n, 'concat', n.getText(sf))
    }
    if (ts.isStringLiteral(n) && BRACKET_RUN.test(n.text)) add(n, 'scanner', n.parent.getText(sf))
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
      [n.left, n.right].some((s) => ts.isStringLiteral(s) && ONE_BRACKET.test(s.text))
    ) {
      add(n, 'scanner', n.getText(sf))
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** the model → text functions of one package, by the type checker */
export function modelToTextSites(pkg: (typeof SCANNED_PACKAGES)[number]): Site[] {
  const configPath = path.join(REPO_ROOT, 'packages', pkg, 'tsconfig.json')
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(`cannot read ${configPath}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
    },
  })
  if (!parsed) throw new Error(`cannot read ${configPath}`)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const modelDirs = MODEL_DIRS.map((d) => path.join(REPO_ROOT, d))
  const isModelDecl = (d: ts.Declaration): boolean => {
    const f = d.getSourceFile().fileName
    return modelDirs.some((m) => f.startsWith(m)) && !/__tests__/.test(f)
  }
  const mentionsModel = (t: ts.Type | undefined, depth = 0): boolean => {
    if (!t || depth > 3) return false
    const sym = t.aliasSymbol ?? t.getSymbol()
    if (sym?.declarations?.some(isModelDecl)) return true
    if (t.isUnionOrIntersection()) return t.types.some((x) => mentionsModel(x, depth + 1))
    const args = t.aliasTypeArguments ?? ((t as ts.TypeReference).target ? checker.getTypeArguments(t as ts.TypeReference) : [])
    return args.some((x) => mentionsModel(x, depth + 1))
  }
  const holdsText = (t: ts.Type | undefined, depth = 0): boolean => {
    if (!t || depth > 3) return false
    if (t.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral | ts.TypeFlags.TemplateLiteral)) return true
    if (t.isUnionOrIntersection()) return t.types.some((x) => holdsText(x, depth + 1))
    if (checker.isArrayType(t)) return holdsText(checker.getTypeArguments(t as ts.TypeReference)[0], depth + 1)
    if (t.flags & ts.TypeFlags.Object && depth < 2) {
      return t.getProperties().some((p) => {
        const decl = p.valueDeclaration ?? p.declarations?.[0]
        return TEXT_FIELDS.has(p.name) && decl !== undefined && holdsText(checker.getTypeOfSymbolAtLocation(p, decl), depth + 1)
      })
    }
    return false
  }
  const own = path.join(REPO_ROOT, 'packages', pkg, 'src') + path.sep
  const out: Site[] = []
  for (const sf of program.getSourceFiles()) {
    const rel = path.relative(REPO_ROOT, sf.fileName)
    if (!sf.fileName.startsWith(own) || !isProductSource(rel)) continue
    const visit = (n: ts.Node): void => {
      const isFn =
        ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n) ||
        ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent))
      if (isFn) {
        const sig = checker.getSignatureFromDeclaration(n as ts.SignatureDeclaration)
        if (sig && sig.getParameters().some((p) => mentionsModel(checker.getTypeOfSymbolAtLocation(p, n))) && holdsText(checker.getReturnTypeOfSignature(sig))) {
          out.push({ file: rel, fn: enclosingName(n, sf), shape: 'model-to-text', text: '' })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return out
}

/** every product source file of the scanned packages, repo-relative */
export function productFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else {
        const rel = path.relative(REPO_ROOT, p)
        if (isProductSource(rel)) out.push(rel)
      }
    }
  }
  for (const pkg of SCANNED_PACKAGES) walk(path.join(REPO_ROOT, 'packages', pkg, 'src'))
  return out.sort()
}

/** the whole tree's sites, both detectors */
export function scanTree(): Site[] {
  const literal = productFiles().flatMap((rel) => literalSites(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')))
  const typed = SCANNED_PACKAGES.flatMap((pkg) => modelToTextSites(pkg))
  return [...literal, ...typed]
}

/** sites keyed with their multiplicity */
export function tallySites(sites: Site[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of sites) m.set(siteKey(s), (m.get(siteKey(s)) ?? 0) + 1)
  return m
}
