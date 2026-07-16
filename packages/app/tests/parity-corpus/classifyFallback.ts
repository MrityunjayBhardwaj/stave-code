/**
 * classifyFallback — honest cause attribution for a Code-fallback pattern.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE (extracted from `_bakery-classify.spec.ts`):
 * the parity sampler's backlog is only as trustworthy as this function, and the
 * previous version silently mis-attributed. It ended with a last-resort arm
 *
 *     if (/\b(let|const|var)\s+…=/.test(live)) return '…binding ref outside stack…'
 *
 * that fired on ANY fallback merely *containing* a `const`/`let`/`var`. Reading
 * the real patterns it bucketed (N≈360 sweep, 20 hits) showed the binding was
 * incidental in every one: they fall back for Hydra visual code, floatbeat DSP,
 * arrow-fn/lambda, `function`/`register` definitions, or an unmodelled combinator.
 * And `parseStrudel` ALREADY resolves `const`/`let`/`var` bindings — transitive
 * chains and refs in every position (receiver, numeric arg, whole-expr) included,
 * directly verified. So a "binding ref" gap does not exist, and labelling one
 * sent the roadmap chasing a phantom (the whole point of #874/#880's lesson: an
 * instrument that lies is worse than no instrument).
 *
 * THE HONEST DESIGN:
 *   1. Detect the CORRECT-BY-NATURE fallbacks first — patterns that have no
 *      musical timeline to show at all (Hydra visual, DSP synthesis, lambdas,
 *      function/class defs). These are not gaps; a better parser cannot "fix"
 *      a pattern that isn't music. Recognising them is what stops them being
 *      counted as addressable work.
 *   2. Then the genuine, addressable GAPs (boot-shape fences #142/#143, module
 *      syntax, parenthesised-root).
 *   3. There is NO "binding ref" bucket. If a fallback still has a binding and
 *      nothing above matched, it is a STRUCTURAL residual (e.g. an unmodelled
 *      combinator like `stepcat`, or a side-effect statement before the
 *      bindings) — labelled so it CANNOT be misread as a ref-resolution gap.
 *
 * Text-only heuristic by design (no parser dependency → hermetic, no gifenc
 * barrel). It runs on already-known fallbacks, so it only has to name the cause,
 * not decide the verdict. Precision over recall: a wrong label is worse than a
 * `triage` label, because a wrong label becomes a roadmap item.
 */

/** Strip comments so a construct named in prose can't trip a detector. Removes
 *  block comments and FULL-LINE `//` comments only — never inline `//`, which
 *  would eat the `//` in a `https://…` URL that Hydra sketches routinely carry. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, '') // full-line // comments
    .trim()
}

/** Hydra visual code. `.out()` is the decisive tell — it is Hydra's render sink
 *  and no Strudel pattern method; `initHydra` is the other unambiguous marker.
 *  Either alone is conclusive, so we don't need the noisier `osc(`/`noise(`
 *  (which collide with Strudel signal names). */
function isHydra(live: string): boolean {
  return /\binitHydra\b/.test(live) || /\.out\s*\(\s*\)/.test(live)
}

/** Floatbeat / bytebeat DSP: a raw sample-generating function fed to `dough`,
 *  or a `Function(...)` built from a string. No note structure by construction. */
function isDsp(live: string): boolean {
  return /\bdough\s*`/.test(live) || /\bFunction\s*\(/.test(live)
}

/** Arrow function anywhere — a lambda has no view metaphor, so a pattern whose
 *  musical body is a lambda is a correct fallback, not a gap. */
function isLambda(live: string): boolean {
  return /=>/.test(live)
}

/** A top-level `function`/`class` definition or a `register(...)` custom method. */
function isDefinition(live: string): boolean {
  return /\bfunction\b/.test(live) || /\bclass\b/.test(live) || /\bregister\s*\(/.test(live)
}

function hasBinding(live: string): boolean {
  return /\b(?:let|const|var)\s+[A-Za-z_$][\w$]*\s*=/.test(live)
}

export function classifyFallback(code: string): string {
  const live = stripComments(code)
  if (live === '') return 'comment-only / empty program'

  // ORDER: correct-by-nature BEFORE addressable gaps, deliberately. A pattern is
  // only an "addressable gap" if the named fix would ACTUALLY recover it. A Hydra
  // sketch that also happens to call `samples({…})` is not recovered by fixing
  // #142 — it has no musical timeline regardless — so it belongs in the CORRECT
  // tier, not counted as gap work. Attributing to the fundamental cause first is
  // what keeps the GAP count honest (the inverse error of the old binding arm,
  // which over-counted; this could under-count, so correct-by-nature must be a
  // TRUE non-recoverable signal — Hydra `.out()`, a lambda body, raw DSP).

  // --- CORRECT-BY-NATURE fallbacks (no musical timeline exists; not gaps) ---
  if (isHydra(live)) return 'CORRECT-FALLBACK: Hydra/visual (no musical timeline by nature)'
  if (isDsp(live)) return 'CORRECT-FALLBACK: DSP/floatbeat synthesis (no note structure)'
  if (/\$\{/.test(live)) return 'CORRECT-FALLBACK: ${} template-interpolation'
  if (isLambda(live)) return 'CORRECT-FALLBACK: functional/lambda (no view metaphor)'
  if (isDefinition(live)) return 'CORRECT-FALLBACK: function/class/register definition'

  // --- ADDRESSABLE GAPS (a better parser or a fence widening would recover) ---
  if (/\btypeof\s+\w+\s*!==?\s*['"]undefined['"]\s*&&/.test(live))
    return 'GAP #143: guarded boot expr typeof X && X(...)'
  if (/\bsamples\s*\(\s*\{/.test(live)) return 'GAP #142: samples({...}) object-literal boot arg'
  if (/^\s*(import|export)\b/m.test(live)) return 'GAP: ES module import/export at top level'
  if (/^\s*\(\s*["'`]/.test(live) && /^\s*\./m.test(live))
    return 'GAP #144: parenthesized-root + leading-dot chain'

  // --- structural residual. NOT a binding-ref gap: parseStrudel resolves
  // const/let/var + transitive chains + refs in every position (verified). A
  // fallback that still has a binding fell back for OTHER structure — an
  // unmodelled combinator (e.g. `stepcat`), a side-effect statement before the
  // bindings, etc. Labelled so it can never be misread as ref-resolution work. ---
  if (hasBinding(live))
    return 'GAP: structural residual (bindings RESOLVE — real cause is other structure, e.g. unmodelled combinator; triage)'

  return 'GAP: uncategorised — needs triage'
}
