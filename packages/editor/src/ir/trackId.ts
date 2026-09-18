/**
 * trackId — the SINGLE rule that turns a track's source label into its stable
 * IR identity (`trackId`), read by `parseStrudel` — and so by the Inspector's
 * views, which are derived from its record since #1387.
 *
 * Two properties, both load-bearing for the Song timeline's lane identity:
 *
 *  1. MUTE-INVARIANT (#737). Mute is a `_` prefix on the label (`$:`→`_$:`,
 *     `drums:`→`_drums:`, design §6.4 / writeStrip.ts). The marker is a DISPLAY
 *     concern — orthogonal to identity — so it is stripped here before the id is
 *     derived. Without the strip, every muted `_$:` collapses onto the single id
 *     `_$` (all anon muted tracks become ONE lane) and a muted `_drums:` becomes
 *     a NEW lane `_drums` instead of staying `drums` — the track loses its place.
 *     Stripping mirrors the DISPLAY deriver `labelAtOffset` (trackLabel.ts:47),
 *     so identity and display agree (closes the P235 laneKey-carries-`_` trap).
 *
 *  2. ANON → POSITIONAL. `$:` (bare label `$`, and thus muted `_$:` after the
 *     strip) keeps the synthetic `d{index+1}` numbering, so existing multi-`$:`
 *     tunes are byte-identical and each anon track owns a distinct positional
 *     lane. A real `name:` label becomes the id verbatim.
 *
 * `index` is the track's 0-based position among the `$:`/`name:` statements
 * (single-track callers pass 0 → `d1`). PURE — no IR, no barrel — so it stays
 * out of the vitest CJS-`gifenc` trap (P172) and is freely unit-testable.
 *
 * ⚠ PROPERTY 2 IS ONLY TRUE OF A DOCUMENT, NOT OF A TRACK (#1667): `d{index+1}`
 * is distinct from its siblings' positional ids, but a user may have written
 * `d2:` as a real label, and then the two ids are the same string. A caller with
 * more than one track uses `trackIdsFromLabels` below, which assigns them
 * together and can see the collision; this per-track entry point is for the
 * single-track case (index 0), where there are no siblings to collide with.
 */
export function trackIdFromLabel(label: string | undefined, index: number): string {
  return namedIdOf(label) ?? `d${index + 1}`
}

/**
 * The id a track's label claims OUTRIGHT, or null when the label names nothing
 * and the id has to be positional. The `_` strip (property 1) and the `$`/empty
 * test (property 2) both live here so the per-track rule above and the
 * whole-document rule below cannot read a label two different ways.
 */
function namedIdOf(label: string | undefined): string | null {
  const bare = label && label.startsWith('_') ? label.slice(1) : label
  return bare && bare !== '$' ? bare : null
}

/**
 * Every track's id, assigned for the WHOLE document at once (#1667).
 *
 * ⚠ THE POSITIONAL RULE CANNOT BE DECIDED ONE TRACK AT A TIME, which is the
 * thing `trackIdFromLabel` above quietly assumes. `d{index+1}` is unique only
 * while no user has written `d{N}:` as a real label — and nothing stops them:
 *
 *     d2: s("bd*2")
 *     $:  s("hh*4")     // position 2 → `d2` → the SAME id as the track above
 *
 * That is not a display blemish. Two tracks under one id is one track as far as
 * every consumer keyed by id is concerned: `declaredTracks` de-dupes by id and
 * DROPS the second (trackOrder.ts), so the Song timeline loses its row outright,
 * and `laneKeyOf` folds both tracks' events into one lane. The mixer showed two
 * strips called `d2` in the same colour, which is how it was found (#1648's stem
 * names had to de-duplicate them).
 *
 * The rule: a positional id starts at its own position — so EVERY document whose
 * names do not collide keeps byte-identical ids, which is the whole safety
 * property here — and counts up to the first `d{N}` nothing else has taken. The
 * taken set is seeded with every label-claimed id and grows with each positional
 * id assigned, because two positional ids can collide with each other once
 * skipping is in play (labels `d2`,`d3` over four statements sends position 2 to
 * `d4`, which position 4 would otherwise take as its own).
 *
 * Labels are NOT auto-renamed and the document is never rewritten: the user's
 * `d2:` keeps `d2`, and only the id the tool made up moves. Which track has to
 * move is a consequence of where the user wrote the label, not a choice.
 *
 * ⚠ A COMMENTED-OUT TRACK IS A SLOT, NOT A CLAIM (#1673). `//p1: …` keeps a
 * `Track` of its own so the numbering holds still when a line is toggled — but
 * written above a live `p1: …` it took the name verbatim, and `declaredTracks`
 * kept the FIRST `p1`: the row was anchored on the comment and the statement
 * the user was editing had none. Every duplicate id in the 558-document archive
 * was this shape. So names are claimed in two rounds: every LIVE label first,
 * then each commented label in source order if its name is still free (so
 * commenting out a track with no live twin keeps its identity, and the first of
 * two commented copies keeps the name). A commented label that loses falls back
 * to a positional id exactly as `$:` does. A document with no such pair is
 * assigned exactly what it was before.
 *
 * `labels` is in source order, one per `$:`/`name:` statement; `commented[i]`
 * marks a `//`-commented one (absent = live). Same purity as above — no IR, no
 * barrel.
 */
export function trackIdsFromLabels(
  labels: readonly (string | undefined)[],
  commented: readonly boolean[] = [],
): string[] {
  const claimed = labels.map(namedIdOf)
  const taken = new Set<string>()
  for (let i = 0; i < claimed.length; i++) {
    const id = claimed[i]
    if (id !== null && !commented[i]) taken.add(id)
  }
  // #1673 — a COMMENTED label claims its name only where nothing live holds it,
  // and the first commented copy wins. Settled here, before any positional id is
  // handed out, so a positional id can never take a name a label still wants.
  const named = claimed.map((id, i) => {
    if (id === null || !commented[i]) return id
    if (taken.has(id)) return null
    taken.add(id)
    return id
  })
  return named.map((id, index) => {
    if (id !== null) return id
    let n = index + 1
    while (taken.has(`d${n}`)) n++
    taken.add(`d${n}`)
    return `d${n}`
  })
}

/**
 * Is this label's track MUTED? (#1488)
 *
 * The other half of the same fact `trackIdFromLabel` above deliberately throws
 * away. Identity must not carry the marker — a muted `_drums:` is still the
 * `drums` lane — but "does this track sound?" is a real question with real
 * consumers, and until this existed the only way to answer it was to read the
 * character at the statement's source offset, which meant handing the document
 * text to anything that needed to know.
 *
 * Lives here, beside the strip, so the two readings of the `_` prefix can never
 * disagree about what a mute marker is.
 *
 * ⚠ A statement with NO label cannot be muted — muting is a prefix ON a label,
 * so a bare `s("bd*4")` has nothing to prefix. `undefined` is therefore false,
 * not unknown (`trackOrder.ts` measured that across every spelling).
 */
export function isMutedLabel(label: string | undefined): boolean {
  return label !== undefined && label.startsWith('_')
}
