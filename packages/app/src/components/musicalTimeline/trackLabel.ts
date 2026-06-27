/**
 * trackLabel — resolve a Song-timeline lane's DISPLAY name from the source label
 * (V-track-1, #579 STEP 2).
 *
 * The live engine keys every track positionally as `d{N}` (the hap `trackId`),
 * dropping the JS label — so a named `bass:` track shows `d1` in the Timeline
 * while the Mixer shows `bass` (the divergence the user reported). STEP 2 closes
 * it: read the label back from the source at the track's OWN `dollarPos` — the
 * `$:`/`bass:` statement offset the engine already stamps on every event
 * (`IREvent.dollarPos`) — so a NAMED track displays its label (and colours by
 * it) while an ANONYMOUS `$:` keeps `d{N}`.
 *
 * Using each lane's OWN `dollarPos` (engine provenance) avoids re-deriving a
 * parallel `d{N}` numbering from the source — the assumption that broke this
 * design TWICE (the engine excludes config lines and counts `_`-muted tracks in
 * ways a naive source parse gets wrong). Each lane resolves independently: no
 * ordering, no off-by-one. Verified live (#579): for `bass:/$:/d3:/$:/lead:/$:`
 * the lanes' dollarPos point exactly at `bass:`, `$:`, `d3:`, `$:`, `lead:`, `$:`.
 *
 * Anonymous-stays-`d{N}` is deliberate friction: a descriptive name requires an
 * explicit `name:` label — the tool never auto-writes one for display
 * (no-auto-naming principle, #579). The display resolves a label when present;
 * it never creates one.
 *
 * PURE — no React, no IR, no editor barrel — so it stays out of the vitest
 * CJS-`gifenc` trap (P172) and is freely unit-testable.
 */

/**
 * The label of the labeled statement at `offset` in `code`, or null when the
 * track is anonymous (`$:`) or the offset doesn't resolve to a `<label>:` head.
 *
 * `dollarPos` points at the statement start (verified live #579), so from there
 * the source reads `<label>: <expr>`. Mirrors the Mixer's `bareLabel`: the
 * leading `_` mute marker is stripped, so a muted `_bass:` still reads `bass`
 * (and a muted anon `_$:` still resolves to anonymous → null).
 */
export function labelAtOffset(code: string, offset: number): string | null {
  if (!Number.isFinite(offset) || offset < 0 || offset >= code.length) return null
  // `dollarPos` is the statement (line) start — tolerate any leading indentation.
  let i = offset
  while (i < code.length && /\s/.test(code[i]!)) i++
  // A labeled statement head: a JS-identifier-ish label (incl. `$`) then `:`.
  const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(code.slice(i))
  if (!m) return null
  const raw = m[1]!
  const bare = raw.startsWith('_') ? raw.slice(1) : raw // strip the `_` mute marker
  if (bare === '' || bare === '$') return null // anonymous `$:` → keep d{N}
  return bare
}

/**
 * A lane's display NAME: the source label when the track is named, else the
 * positional `laneKey` (`d{N}`). `labelOffset` is the lane's `dollarPos`; null
 * when the lane has no source provenance (a producer-built lane like a chord
 * progression, or `code` not yet available) → keep `laneKey`.
 *
 * The lane's IDENTITY stays `laneKey` (`d{N}`) for the live hap-overlay match —
 * only the display name (and the colour derived from it) resolves to the label.
 */
export function resolveLaneName(
  laneKey: string,
  labelOffset: number | null | undefined,
  code: string | null | undefined,
): string {
  if (code == null || labelOffset == null) return laneKey
  return labelAtOffset(code, labelOffset) ?? laneKey
}
