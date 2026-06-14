/**
 * Note-token ↔ MIDI helpers for the piano roll's vertical axis.
 *
 * Numeric convention matches the engine's `noteToMidi` (`c3 = 48`,
 * `eb4 = 63`). Accidentals accept Strudel's three spellings on read — `#`,
 * `b`, and `s` (`cs3`) — and emit `#` on write. Conversion only feeds row
 * placement and newly-created notes; the round-trip itself stores the token
 * verbatim, so emission style never threatens fidelity for existing notes.
 */

const SEMITONE_OF: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

/** `c3` / `c#3` / `cs3` / `eb4` → MIDI number, or null if not a note token. */
export function pitchToMidi(token: string): number | null {
  const m = token.toLowerCase().match(/^([a-g])(s|#|b)?(-?\d+)$/)
  if (!m) return null
  const [, letter, accidental, octave] = m
  let semitone = SEMITONE_OF[letter]
  if (accidental === 's' || accidental === '#') semitone += 1
  else if (accidental === 'b') semitone -= 1
  return (parseInt(octave, 10) + 1) * 12 + semitone
}

/** MIDI number → canonical note token (sharps as `#`). Inverse of pitchToMidi. */
export function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${octave}`
}

/** Is this MIDI pitch a black key (for striping the roll's pitch rows)? */
export function isBlackKey(midi: number): boolean {
  return SHARP_NAMES[((midi % 12) + 12) % 12].includes('#')
}
