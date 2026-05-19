import { describe, it, expect } from 'vitest'
import { classifyLiteralRhs } from '../parseStrudel'

/**
 * Phase 20-17 G3 (D-02 CORRECTION) — STRICT literal recognition contract.
 *
 * This spec PINS the matcher line that `classifyLiteralRhs` enforces. The
 * Wave-E bounded fixpoint loop will consume the helper post-parse; the
 * matcher line is what keeps "substitute a literal as term-splicing" from
 * silently becoming "evaluate an expression on the parser side".
 *
 * Loosening the regex (e.g. adding `\s` or `[+\-]`) MUST break the
 * boundary cases below — they are the matcher-line guarantee:
 *   - `4 + 1` is an expression, not a literal → null
 *   - templates / calls / arrays / arrow / concat → null
 *   - `via.raw` is byte-equal to the TRIMMED RHS for every literal case
 *     (term-splicing, never evaluation)
 *
 * D-1a ships the type widen + this helper. D-1b (this file) locks the
 * contract. E-1 wires it into buildBindingMap. The single named home
 * is `classifyLiteralRhs` in parseStrudel.ts (alongside `wrapAsOpaque`).
 */

describe('classifyLiteralRhs — STRICT literal recognition (20-17 G3 / D-02 CORRECTION)', () => {
  describe('positives — bare literals classify and round-trip via.raw byte-equal', () => {
    const positives: Array<{ rhs: string; expectedRaw: string }> = [
      // Numbers — `^-?\d+(\.\d+)?$`
      { rhs: '4', expectedRaw: '4' },
      { rhs: '-3', expectedRaw: '-3' },
      { rhs: '0.5', expectedRaw: '0.5' },
      { rhs: '-12.75', expectedRaw: '-12.75' },
      // Plain double-quoted — `^"[^"]*"$`
      { rhs: '"bd"', expectedRaw: '"bd"' },
      // Plain single-quoted — `^'[^']*'$`
      { rhs: "'<sd hh>'", expectedRaw: "'<sd hh>'" },
    ]

    for (const { rhs, expectedRaw } of positives) {
      it(`classifies "${rhs}" as a literal Code-with-via node`, () => {
        const node = classifyLiteralRhs(rhs)
        expect(node).not.toBeNull()
        if (!node) return
        // Tag + lang shape
        expect(node.tag).toBe('Code')
        expect(node.lang).toBe('strudel')
        // `code` is the trimmed RHS (mirrors `via.raw`)
        expect(node.code).toBe(expectedRaw)
        // via shape — literal arm
        expect(node.via).toBeDefined()
        expect(node.via.literal).toBe(true)
        // Round-trip assertion (the matcher's term-splicing contract):
        // via.raw is byte-equal to the trimmed RHS — NEVER coerced.
        // `4` stays the string "4", NOT the number 4.
        expect(node.via.raw).toBe(expectedRaw)
        expect(typeof node.via.raw).toBe('string')
      })
    }

    it('trims surrounding whitespace before matching (raw is the trimmed text)', () => {
      const node = classifyLiteralRhs('  4  ')
      expect(node).not.toBeNull()
      if (!node) return
      // The trim is part of the contract — `raw` is the TRIMMED RHS, not
      // the source-leading-whitespace version. This mirrors buildBindingMap's
      // existing `bm[2].trim()` call site so a literal classification on a
      // pre-trimmed RHS is byte-stable.
      expect(node.via.raw).toBe('4')
    })
  })

  describe('negatives — non-literal RHS returns null (caller keeps bare Code → opaque fence fires)', () => {
    const negatives: string[] = [
      // Arithmetic — `+` is not in the number regex
      '4 + 1',
      '4+1',
      '1 - 1',
      // Template literal
      '`x${n}`',
      // Function call
      'makeBass()',
      // Arrow function
      '() => x',
      'x => x + 1',
      // Array literal
      '[1,2]',
      '[1, 2, 3]',
      // String concatenation
      '"a" + "b"',
      // Mini pattern call (a wrapped string, NOT a bare string literal)
      'n("0")',
      // Identifier reference (E-1 G2 territory — handled by bound-ident-root, not by literal classification)
      'numChords',
      // Empty / whitespace-only
      '',
      '   ',
      // Object literal
      '{a:1}',
      // Hex / binary / float-notation edge cases that the strict regex rejects
      '0x10',
      '1e3',
      // Concatenated strings that LOOK plain but contain interior unescaped quotes
      '"a"b"',
      // Single-quote with interior unescaped single quote
      "'a'b'",
    ]

    for (const rhs of negatives) {
      it(`rejects "${rhs}" (returns null)`, () => {
        expect(classifyLiteralRhs(rhs)).toBeNull()
      })
    }
  })

  describe('term-splicing contract — via.raw is NEVER evaluated', () => {
    it('a numeric literal stays a string in via.raw (no JS Number coercion)', () => {
      const node = classifyLiteralRhs('4')
      expect(node).not.toBeNull()
      if (!node) return
      // The classifier MUST NOT do `Number(t)` — that would erase the
      // string/number distinction Wave E's substitution depends on.
      // Splicing the term `4` into `.slow(numChords)` produces `.slow(4)`
      // verbatim; evaluating it would produce `.slow(4)` *as a JS number*
      // and break the round-trip byte-fidelity.
      expect(node.via.raw).toBe('4')
      expect(typeof node.via.raw).toBe('string')
      // Defensive: the node carries no `as unknown as number` coercion
      // anywhere in the via object.
      expect(node.via).toEqual({ literal: true, raw: '4' })
    })

    it('a quoted-string literal preserves both quote style and contents byte-verbatim', () => {
      const dq = classifyLiteralRhs('"bd"')
      expect(dq).not.toBeNull()
      if (!dq) return
      // Quote style is preserved — `"bd"` stays double-quoted, never
      // re-emitted as `'bd'` or as the bare token `bd`. This is the
      // P62 code-invariance contract for the round-trip path.
      expect(dq.via.raw).toBe('"bd"')

      const sq = classifyLiteralRhs("'sd'")
      expect(sq).not.toBeNull()
      if (!sq) return
      expect(sq.via.raw).toBe("'sd'")
    })
  })
})
