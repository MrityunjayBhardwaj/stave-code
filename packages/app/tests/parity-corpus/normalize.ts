/**
 * normalize.ts — IR-shape normalizer for the Strudel.cc parity corpus.
 *
 * Phase 20-14 γ-2 (D-01 — structural parity only).
 *
 * `normalizeIRShape(ir)` strips fields known to vary across runs OR known
 * NOT to be load-bearing for the structural-parity claim. Every stripped
 * field carries a one-line rationale inline in the stripper table below.
 *
 * RULE for adding new stripped fields:
 *   - Add the field name + a one-line WHY comment to STRIP_FIELDS below.
 *   - The WHY must answer: "what class of drift would this snapshot
 *     otherwise mask?" If you can't answer it, do NOT add the field —
 *     instead extend the snapshot to capture the new shape signal.
 *
 * The normalizer is intentionally narrow today. Future drift in deterministic
 * fields (e.g. parser refactor surfaces a new IR tag) MUST show up as a
 * snapshot diff and be reviewed — that's the gate, not a maintenance burden.
 */

// Fields stripped from every IR node before snapshotting, with WHY.
const STRIP_FIELDS: Record<string, string> = {
  // Source-loc offsets are byte-position metadata. They are
  // deterministic for a given source string, but they change with ANY
  // file-framing tweak (an extra newline at the top, trailing whitespace
  // normalization, even editor IDE line-ending policy on Windows). Pinning
  // them in the snapshot would conflate "the IR shape drifted" with
  // "the corpus file's framing drifted" — D-01 cares only about the
  // former. The IREvent-level loc layer is asserted by the editor's own
  // parity.test.ts at runtime; this corpus is the parser-IR rung.
  loc: 'source-byte offsets — drift with file framing, not IR shape',

  // callSiteRange lives inside Code.via for opaque-fragment wrappers
  // (parseStrudel.ts:73 wrapAsOpaque); same source-byte rationale as loc.
  // Stripped at the .via level via a dedicated rewrite below — see
  // normalizeViaCallSite.
}

/**
 * Recursively walk the IR tree, returning a plain JSON-shaped clone with
 * the STRIP_FIELDS removed at every node. Other fields pass through
 * unchanged, including nested PatternIR children (recursion is structural
 * — we don't enumerate tag-specific child slot names, just walk any nested
 * object/array we encounter).
 *
 * Returns `unknown` to discourage callers from inspecting specific tag
 * fields directly — the only consumer is the snapshot serializer.
 */
export function normalizeIRShape(ir: unknown): unknown {
  if (ir === null || ir === undefined) return ir
  if (typeof ir !== 'object') return ir
  if (Array.isArray(ir)) return ir.map(normalizeIRShape)

  const src = ir as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const key of Object.keys(src)) {
    if (key in STRIP_FIELDS) continue
    const value = src[key]
    if (key === 'via' && value && typeof value === 'object') {
      // Code.via wrapper — strip callSiteRange explicitly (it lives inside
      // via, not at the node root). Other via fields (method, args, inner)
      // are load-bearing for the wrapper-vs-fallback distinction (PV37 /
      // PK13 step 2) and stay in the snapshot.
      const viaSrc = value as Record<string, unknown>
      const viaOut: Record<string, unknown> = {}
      for (const vKey of Object.keys(viaSrc)) {
        if (vKey === 'callSiteRange') continue
        viaOut[vKey] = normalizeIRShape(viaSrc[vKey])
      }
      out[key] = viaOut
      continue
    }
    out[key] = normalizeIRShape(value)
  }
  return out
}
