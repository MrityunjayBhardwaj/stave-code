/**
 * Convert a note name string or MIDI number to a MIDI note number.
 * Returns null if the input is unrecognized (e.g. percussion sample names).
 *
 * Examples: "c3" → 48, "eb4" → 63, "f#2" → 42, 60 → 60
 */
export function noteToMidi(note: unknown): number | null {
  if (typeof note === 'number') return Math.round(note)
  if (typeof note !== 'string') return null

  const m = note.toLowerCase().match(/^([a-g])(b|#)?(-?\d+)$/)
  if (!m) return null

  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0
  return (parseInt(m[3]) + 1) * 12 + base[m[1]] + acc
}
