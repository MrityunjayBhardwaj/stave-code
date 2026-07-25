/**
 * stringParser.ts — THE ONE rule for what a bare string becomes when Strudel reifies it.
 *
 * WHAT `reify` DOES. `@strudel/core`'s `reify(thing)` returns a pattern unchanged, and
 * otherwise hands a string to whatever parser `setStringParser` installed, falling back
 * to `pure(thing)` when none is (`pattern.mjs:1285-1293`). `miniAllStrings()` installs
 * `mini` (`mini.mjs:259-260`), and `mini` THROWS on anything that is not mini notation.
 *
 * WHY THE BARE CALL IS WRONG. The transpiler rewrites double-quoted and template strings
 * into located mini calls, so those never reach `reify` as strings at all. Every OTHER
 * string does — including ones that were never meant to be notation:
 *
 *     s('bd').label('🍕')      // an emoji label
 *     note('c4 e4')            // a single-quoted mini, which SHOULD pattern-parse
 *
 * With a bare `miniAllStrings()`, the first throws and takes the whole evaluation down.
 * With no parser at all, the second silently plays as ONE note whose value is the string
 * `"c4 e4"` — no error, just the wrong music. Neither is acceptable, and the project has
 * shipped both at once: the engine installed the parser (so the live app threw on the
 * emoji) while the measurement harness did not (so it scored documents the app would
 * have failed). See the note on congruence below.
 *
 * THE RULE: try mini, and fall back to the plain value when it does not parse. A string
 * that is mini notation becomes the pattern it spells; a string that is not stays exactly
 * what it was before any parser was installed. Nothing that worked stops working.
 *
 * ON LOCATIONS: `mini(str)` builds its spans in the STRING's own coordinate space, not
 * the document's — the transpiler is what supplies a document offset, and it never saw
 * these. That is fine and needs no handling here, because admission is decided downstream
 * by membership in the transpiler's own declared locations: a span from a string the
 * transpiler never rewrote is an offset in an undeclared space and is not admitted. This
 * function is precisely the case that rule exists for.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** the pieces of `@strudel/core` and `@strudel/mini` this needs — passed in, never imported here */
export interface StringParserDeps {
  core: { setStringParser?: (p: ((s: string) => unknown) | undefined) => void; pure: (v: unknown) => unknown }
  mini: { mini: (s: string) => unknown }
}

/**
 * Point `reify`'s string parser at mini, with a plain-value fallback.
 *
 * Call once per evaluation environment, after `evalScope`. Every caller — the live
 * engine, the offline renderer, the measurement harness — must use THIS rather than
 * `miniAllStrings()` directly, or they are running different languages: an instrument
 * that parses strings differently from the engine is measuring a dialect nobody ships.
 */
export function installMiniStringParser(deps: StringParserDeps): void {
  const { core, mini } = deps
  core.setStringParser?.((s: string) => {
    try {
      return mini.mini(s)
    } catch {
      // not mini notation — exactly what `reify` would have produced with no parser
      return core.pure(s)
    }
  })
}

/** Remove the parser, restoring `reify`'s bare `pure` behaviour. For tests that need the contrast. */
export function clearStringParser(deps: Pick<StringParserDeps, 'core'>): void {
  deps.core.setStringParser?.(undefined)
}
