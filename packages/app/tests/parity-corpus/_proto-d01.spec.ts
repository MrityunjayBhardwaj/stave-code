/**
 * _proto-d01.spec.ts — Phase 20-17 D-01 least-fixpoint regression oracle.
 *
 * VENDORED from the preserved Task-1 prototype (/tmp/proto-d01-fixpoint.spec.ts,
 * 20-16). Maintainer-only: run via `pnpm --filter @stave/app test:proto`
 * (vitest.proto.config.ts) — NOT in the CI `vitest.config.ts` include, mirroring
 * the `_bakery-classify.spec.ts` underscore convention. Runs under vite-node so
 * `parseExpression`/`parseStrudel` import from the editor SOURCE path (the
 * @stave/editor barrel crashes standalone node via @strudel/draw → gifenc).
 *
 * It vendors byte-for-byte copies of `splitTopLevelStatements` / `BINDING_RE`
 * + the proposed fixpoint variant; it does NOT edit parseStrudel.ts. The
 * per-iteration diagnostic console.log is the wave-by-wave observation
 * evidence — do NOT silence it. The 6 #141 repros live alongside this spec
 * under bakery-runs/ (was /tmp/ in the throwaway prototype).
 */
import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseExpression, skipWhitespaceAndLineComments, parseStrudel } from '../../../editor/src/ir/parseStrudel'
import type { PatternIR } from '../../../editor/src/ir/PatternIR'

// Vendored Wave-0 oracle: the 6 #141 repros live alongside this spec under
// bakery-runs/ (was /tmp/ in the throwaway prototype). Loaded verbatim.
const REPRO_DIR = path.join(__dirname, 'bakery-runs')
const readRepro = (r: string): string =>
  fs.readFileSync(path.join(REPRO_DIR, `repro${r}.strudel`), 'utf8')

// ---- exact copies of the private primitives from parseStrudel.ts ----
const BINDING_RE = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/

function splitTopLevelStatements(
  body: string,
  baseOffset: number,
): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = []
  let depth = 0
  let inString = false
  let stringChar = ''
  let escaped = false
  let segStart = 0
  let i = 0
  const flush = (end: number): void => {
    const raw = body.slice(segStart, end)
    if (raw.trim().length > 0) {
      // #151/#152: strip /* */ + // and skip if nothing executable
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
        .trim()
      if (stripped.length > 0) {
        const lead = raw.length - raw.trimStart().length
        out.push({ text: raw.trim(), offset: baseOffset + segStart + lead })
      }
    }
    segStart = end + 1
  }
  while (i < body.length) {
    const ch = body[i]
    if (escaped) { escaped = false; i++; continue }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === stringChar) inString = false
      i++; continue
    }
    if (ch === '/' && body[i + 1] === '/') {
      while (i < body.length && body[i] !== '\n') i++
      continue
    }
    if (ch === '/' && body[i + 1] === '*') {
      // #152: skip /* ... */ block comments. Mirror of production.
      i += 2
      while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++
      if (i < body.length) i += 2
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = true; stringChar = ch; i++; continue }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; i++; continue }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; i++; continue }
    if (depth === 0 && ch === ';') { flush(i); i++; continue }
    if (depth === 0 && ch === '\n') {
      // #148 forward-peek for `.` + #150 backward-peek for `=`. Mirror
      // of production parseStrudel.ts.
      const peek = skipWhitespaceAndLineComments(body, i + 1)
      if (body[peek] === '.') { i++; continue }
      let k = i - 1
      while (k >= segStart && /\s/.test(body[k])) k--
      if (k >= segStart && body[k] === '=') { i++; continue }
      flush(i); i++; continue
    }
    i++
  }
  flush(body.length)
  return out
}

const isBareCode = (ir: PatternIR): boolean =>
  ir.tag === 'Code' && (ir as { via?: unknown }).via === undefined

// ---- PROPOSED D-01 fixpoint variant (A-1 descriptor list + A-2 loop) ----
interface Desc { stmtIndex: number; name: string; rhs: string; rhsOffset: number }

const DIAG: string[] = []

function buildBindingMapFixpoint(
  body: string,
  baseOffset: number,
  // OQ1 relaxation toggle (prototype probes BOTH dispositions)
  relaxUnreferencedOpaque: boolean,
  diagTag = '',
): { bindings: ReadonlyMap<string, PatternIR>; finalExpr: string; finalOffset: number } | null {
  const D = (s: string): void => { if (diagTag) DIAG.push(`[${diagTag}] ${s}`) }
  const stmts = splitTopLevelStatements(body, baseOffset)
  D(`stmts=${stmts.length}`)
  if (stmts.length < 2) { D('BAIL <2 stmts'); return null }

  // A-1: descriptor list + finalIdx + statement-order short-circuit
  const descs: Desc[] = []
  let finalIdx = -1
  for (let s = 0; s < stmts.length; s++) {
    const { text, offset } = stmts[s]
    const bm = text.match(BINDING_RE)
    if (!bm) { finalIdx = s; break }
    const name = bm[1]
    const rhs = bm[2].trim()
    const rhsStartInText = text.length - rhs.length
    descs.push({ stmtIndex: s, name, rhs, rhsOffset: offset + rhsStartInText })
  }
  D(`descs=${descs.map((d) => d.name).join(',')} finalIdx=${finalIdx} finalText=${finalIdx >= 0 ? JSON.stringify(stmts[finalIdx].text.slice(0, 60)) : 'n/a'}`)
  if (finalIdx === -1) { D('BAIL finalIdx=-1 (all bindings)'); return null }
  if (finalIdx !== stmts.length - 1) { D(`BAIL finalIdx ${finalIdx} != last ${stmts.length - 1} (trailing binding)`); return null }

  // A-1 OQ4: dup-key keyed on declaration identity (stmtIndex), first-dup-wins
  const seen = new Set<string>()
  for (const d of descs) {
    if (seen.has(d.name)) { D(`BAIL dup-key ${d.name}`); return null }
    seen.add(d.name)
  }

  const finalExpr = stmts[finalIdx].text
  const finalOffset = stmts[finalIdx].offset

  // A-2 step 5a: PRE-SUBSTITUTION syntactic reference graph (RHS text +
  // final-expr text). Identifier class = BINDING_RE LHS class.
  const idRe = /[A-Za-z_$][\w$]*/g
  const referencedNames = new Set<string>()
  const scanIds = (txt: string, excludeOwn?: string): void => {
    for (const m of txt.matchAll(idRe)) {
      if (m[0] !== excludeOwn) referencedNames.add(m[0])
    }
  }
  for (const d of descs) scanIds(d.rhs)
  scanIds(finalExpr)

  // A-2: bounded least-fixpoint over the RHS parse (<= N iterations)
  const resolved = new Map<string, PatternIR>()
  const pending = new Set(descs.map((d) => d.stmtIndex))
  const N = descs.length
  for (let iter = 0; iter < N; iter++) {
    let added = 0
    for (const d of descs) {
      if (!pending.has(d.stmtIndex)) continue
      const ir = parseExpression(d.rhs, d.rhsOffset, undefined, resolved)
      const bc = isBareCode(ir)
      D(`iter${iter} ${d.name} rhs=${JSON.stringify(d.rhs.slice(0, 50))} -> tag=${ir.tag} bareCode=${bc}`)
      if (!bc) {
        resolved.set(d.name, ir)
        pending.delete(d.stmtIndex)
        added++
      }
    }
    if (added === 0) break
  }
  D(`post-fixpoint resolved=[${[...resolved.keys()].join(',')}] pending=[${[...pending].join(',')}]`)

  // A-2 step 3 + 5b: occurs-check terminal / opaque fence post-fixpoint
  for (const d of descs) {
    if (!pending.has(d.stmtIndex)) continue
    // still unresolved after fixpoint: bare-Code RHS (opaque or cyclic)
    if (relaxUnreferencedOpaque) {
      // eligible iff name absent from EVERY OTHER desc RHS text AND final-expr text
      const others = descs.filter((x) => x.stmtIndex !== d.stmtIndex)
      const refElsewhere = new Set<string>()
      for (const o of others) for (const m of o.rhs.matchAll(idRe)) refElsewhere.add(m[0])
      for (const m of finalExpr.matchAll(idRe)) refElsewhere.add(m[0])
      if (!refElsewhere.has(d.name)) {
        // provably-unreferenced opaque binding → drop, do NOT whole-program bail
        pending.delete(d.stmtIndex)
        continue
      }
    }
    return null // opaque-RHS / occurs-check terminal → whole-program Code bail
  }

  return { bindings: resolved, finalExpr, finalOffset }
}

// Mirror parseStrudel's no-$: entry: build map, parse final expr threading
// bindings, wrap in synthetic Track('d1', body); classify P67.
function classify(code: string, relax: boolean, diagTag = ''): { verdict: 'structured' | 'code'; reason: string } {
  // strip whole-line comments + blank lead is done by stripParserPrelude in
  // real code; for the prototype the repros are extracted raw — emulate the
  // minimal prelude strip (drop leading // lines + the recognised setcps()
  // boot call) so the binding map sees the binding region. We approximate by
  // running the proposed map over the raw body; setcps(1) etc. are handled
  // by the real stripParserPrelude in production — here we test the FIXPOINT
  // shape, not the strip (Wave B).
  const lines = code.split('\n')
  // drop leading comment/blank lines and a leading setcps/setcpm/samples line
  let start = 0
  while (start < lines.length) {
    const t = lines[start].trim()
    if (t === '' || t.startsWith('//') || /^(setcps|setCps|setcpm|setCpm|samples|useRNG|initAudio|aliasBank|setVoicingRange)\s*\(/.test(t)) {
      start++
    } else break
  }
  // also drop a trailing // @version line region — keep simple: cut trailing comment-only lines
  let end = lines.length
  while (end > start && (lines[end - 1].trim() === '' || lines[end - 1].trim().startsWith('//') || lines[end - 1].trim().startsWith('/*') || lines[end - 1].trim().startsWith('*'))) end--
  const body = lines.slice(start, end).join('\n')
  const baseOffset = lines.slice(0, start).join('\n').length + (start > 0 ? 1 : 0)

  const bound = buildBindingMapFixpoint(body, baseOffset, relax, diagTag)
  if (!bound) {
    return { verdict: 'code', reason: 'buildBindingMap returned null (fence/shape/occurs-check/dup-key)' }
  }
  const inner = parseExpression(bound.finalExpr, bound.finalOffset, undefined, bound.bindings)
  if (diagTag) DIAG.push(`[${diagTag}] FINAL parse -> tag=${inner.tag} via=${(inner as { via?: unknown }).via !== undefined} bareCode=${isBareCode(inner)}`)
  if (isBareCode(inner)) {
    return { verdict: 'code', reason: 'final expr resolved to bare Code' }
  }
  return { verdict: 'structured', reason: `Track(d1, ${inner.tag})` }
}

describe('D-01 fixpoint HARD GATE prototype', () => {
  it('runs the 6 #141 repros + synthetics under BOTH OQ1 dispositions', () => {
    const repros = [
      '__LsnlgQ6osk', '_1j62z5xjyCN', '_72eEl7NwK9e',
      '_CyO42BOyp5a', '_L13nBhrqGR_', '_LHtBlF8peGC',
    ]
    const out: string[] = []
    out.push('=== 6 REPROS (proto buildBindingMap variant) ===')
    for (const r of repros) {
      const code = readRepro(r)
      const noRelax = classify(code, false)
      const relax = classify(code, true, `R:${r}`)
      out.push(`${r.padEnd(14)} | noRelax=${noRelax.verdict.padEnd(10)} (${noRelax.reason})`)
      out.push(`${' '.repeat(14)} | relax  =${relax.verdict.padEnd(10)} (${relax.reason})`)
    }
    out.push('')
    out.push('=== 6 REPROS (PRODUCTION parseStrudel — current source with Wave 0 bundle) ===')
    for (const r of repros) {
      const code = readRepro(r)
      const ir = parseStrudel(code) as Record<string, unknown>
      // Mirror _bakery-classify.spec.ts:isCodeFallback — Track wrapper has `.body`.
      const body =
        ir.tag === 'Track' && ir.body && typeof ir.body === 'object'
          ? (ir.body as Record<string, unknown>)
          : ir
      const isBare = body.tag === 'Code' && (body as { via?: unknown }).via === undefined
      out.push(`${r.padEnd(14)} | production=${isBare ? 'code (bare)' : `structured (body.tag=${body.tag}${(body as { via?: unknown }).via !== undefined ? ' via' : ''})`}`)
    }
    out.push('')
    out.push('=== SYNTHETICS ===')
    const fwd = 'const a=b\nconst b=n("0")\nstack(a)'
    const cyc = 'const a=b\nconst b=a\nstack(a,b)'
    const dup = 'var x=n("0")\nvar x=n("1")\nstack(x)'
    const deadOpaque = 'var d=makeBass()\nconst p=n("0")\nstack(p)'
    const refOpaque = 'const p=makeBass()\nstack(p)'
    for (const [label, src, relax] of [
      ['forward-ref (b)', fwd, false],
      ['cyclic (c)', cyc, false],
      ['dup-key (d)', dup, false],
      ['dead-opaque 5c [noRelax]', deadOpaque, false],
      ['dead-opaque 5c [relax]', deadOpaque, true],
      ['ref-opaque 5c [relax]', refOpaque, true],
    ] as [string, string, boolean][]) {
      const v = classify(src, relax)
      out.push(`${label.padEnd(28)} | ${v.verdict.padEnd(10)} (${v.reason})`)
    }
    out.push('')
    out.push('=== DIAGNOSTICS (relax run per repro) ===')
    out.push(...DIAG)
    const text = out.join('\n')
    // eslint-disable-next-line no-console
    console.log('\n' + text + '\n')
    fs.writeFileSync('/tmp/proto-d01-output.txt', text)
  })
})
