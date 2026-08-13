/**
 * chordLanes — is this step grid holding CHORD SYMBOLS rather than sound names?
 *
 * ── WHY THIS QUESTION HAS TO BE ASKED OF THE CONTENT ─────────────────────
 * The obvious cheaper answer is the route: the head is known when a chunk is
 * routed, so "the head did not say `s`" looks like it should mean "these are not
 * sample names". Measured across 207 documents, that is false. Of the 13 units
 * that reach the grid through the content fallback, SEVEN are ordinary drum
 * patterns whose head is silent because the sound is assigned further along the
 * chain:
 *
 *     "<sd hh>".fast("<2@3 4>")            lanes: sd, hh
 *     "hh*4".color('#673AB7')              lanes: hh
 *     "<bd!3 bd(3,4,3)>".color('#F5A623')  lanes: bd
 *
 * — plus a synth waveform (`sawtooth`), a sample name (`breaks165`) and a set of
 * `pick` keys (`polyrhythm · polymeter · both`). Routing on the head would
 * relabel all of those to fix the two that are chord charts. A silent head means
 * the sound assignment moved, not that the tokens stopped being sounds. So the
 * only thing that can answer is the tokens themselves (#1241).
 *
 * ── WHY A LIBRARY AND NOT A REGEX ────────────────────────────────────────
 * Chord spelling is a real grammar — `Gsus`, `Em11`, `Am9`, `Bm!3`, `C^7`, bare
 * `F` — and a hand-written pattern for it is a rule nobody can check. `@tonaljs`
 * already ships one and is already in this tree (`@strudel/tonal` depends on it,
 * which is what makes these chords SOUND). Measured on the real vocabulary from
 * both corpora at the version pinned here: 13 of 13 chord symbols recognised,
 * and of the 85 tokens in the curated drum + instrument catalogues, 84 rejected.
 *
 * ⚠ THE ONE COLLISION IS `cb`. It is the Cowbell token and it is also a legal
 * chord — C-flat major. Where the two vocabularies overlap the DRUM one wins,
 * because a grid's lanes are sounds by default and a chord reading has to
 * displace that rather than tie with it. This is the only overlap in 85 tokens,
 * so the precedence rule is one line and its population is one token; it is
 * written down here rather than left to the all-lanes rule below to absorb,
 * because that rule would hide it instead of deciding it.
 */
import { get as getChord } from '@tonaljs/chord'
import { isKnownDrumVoice } from './drumVoices'

/**
 * Is one lane token a chord symbol?
 *
 * The drum vocabulary is consulted FIRST and is authoritative — see the `cb`
 * note above. The token is passed to the chord grammar RAW, with no `:variant`
 * stripping: `C:major` is a scale, not a chord, and the grammar rejects it,
 * which is the answer we want. (Stripping would turn it into a bare `C` and
 * silently promote a scale list into a chord chart.)
 */
export function isChordSymbol(token: string): boolean {
  if (isKnownDrumVoice(token)) return false
  try {
    return !getChord(token).empty
  } catch {
    // The grammar is someone else's and its throw surface is not ours to
    // enumerate. A token it cannot read is not a chord — which is the same
    // answer as `empty`, reached without trusting it not to throw.
    return false
  }
}

/**
 * Does EVERY lane of this grid hold a chord symbol?
 *
 * All, not most, and not any. A drum kit that happens to contain one
 * chord-shaped token stays a drum kit — which is what keeps the `cb` collision
 * harmless even where the precedence rule above did not already settle it,
 * since a real cowbell lane sits beside `bd`/`sd`/`hh`, none of which parse.
 * A grid with no lanes is not a chord chart either; the empty case answers
 * false rather than vacuously true.
 */
export function chordLanes(laneSounds: readonly string[]): boolean {
  return laneSounds.length > 0 && laneSounds.every(isChordSymbol)
}
