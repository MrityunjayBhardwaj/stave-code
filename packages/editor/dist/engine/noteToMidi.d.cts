/**
 * Convert a note name string or MIDI number to a MIDI note number.
 * Returns null if the input is unrecognized (e.g. percussion sample names).
 *
 * This is the one note-name reader (#1928). Its grammar is Strudel's own
 * (`@strudel/core` util.mjs `tokenizeNote` / `noteToMidi`), so a name means here
 * what it means to the sound: a letter, any run of accidentals from `#` `s`
 * (sharp) and `b` `f` (flat) that add up, and an optional octave that defaults
 * to 3. A test pins it to Strudel's function.
 *
 * Examples: "c3" → 48, "eb4" → 63, "cs3" → 49, "g" → 55, "ef3" → 51,
 * "Bbb2" → 45, "f#2" → 42, 60 → 60
 */
declare function noteToMidi(note: unknown): number | null;

export { noteToMidi };
