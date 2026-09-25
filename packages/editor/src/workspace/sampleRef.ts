/**
 * sampleRef — which sample FILE an event plays, as the fields superdough
 * chooses it by (#1764). Pure, with type-only imports, so the app's tests can
 * use the real function from source while they mock the editor barrel.
 */
import type { IREvent } from '../ir/IREvent'

/** The shape `getSampleInfo` needs — the subset of a hap the timeline can supply. */
export interface SampleRef {
  /** Sound name, i.e. the `s` of the event. */
  readonly s: string
  /**
   * MIDI note, when the mark carries one.
   *
   * Load-bearing for multi-sample instruments: an object-format bank picks its
   * file by nearest note (`superdough/util.mjs:97-107`), so a piano's low C and
   * high C are different files with different shapes. Percussive marks have no
   * pitch and pass nothing.
   */
  readonly note?: number | string | null
  /** Frequency in Hz; superdough reads it before `note` (`util.mjs:62-80`). */
  readonly freq?: number | null
  /** Sample index within the bank (`n`); defaults to superdough's own 0. */
  readonly n?: number | null
}

/**
 * #1764 — which file an event plays, as the fields superdough chooses it by.
 * Null for an event with no sound name.
 *
 * - `bank` RENAMES the sound: superdough plays `${bank}_${s}`
 *   (`superdough.mjs:538-539`), and looks that name up lowercased.
 * - `n` picks the file within the sound's list, wrapping round
 *   (`util.mjs:109-128`).
 * - `freq`, else `note`, picks the nearest key of a pitched bank
 *   (`valueToMidi`, `util.mjs:62-80`).
 *
 * ⚠ `ev.note` holds `n` when the hap had no `note` (`normalizeStrudelHap`), so a
 * `note` equal to `n` is read as that fold and dropped. The one hap this misreads
 * sets both to the same number on a pitched bank; it then picks from key 36
 * (superdough's own fallback) instead of that note.
 */
export function sampleRefOf(ev: Pick<IREvent, 's' | 'n' | 'note' | 'freq' | 'params'>): SampleRef | null {
  if (ev.s == null || ev.s === '') return null
  const bank = ev.params?.bank
  const s = typeof bank === 'string' && bank !== '' ? `${bank}_${ev.s}` : ev.s
  const n = typeof ev.n === 'number' && Number.isFinite(ev.n) ? ev.n : null
  const note = ev.note != null && !(n != null && ev.note === n) ? ev.note : null
  return { s, n, note, freq: ev.freq ?? null }
}
