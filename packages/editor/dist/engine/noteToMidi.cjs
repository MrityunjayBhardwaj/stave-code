'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/engine/noteToMidi.ts
function noteToMidi(note) {
  if (typeof note === "number") return Math.round(note);
  if (typeof note !== "string") return null;
  const m = note.match(/^([a-gA-G])([#bsf]*)(-?\d*)$/);
  if (!m) return null;
  const [, letter, accidentals, octave] = m;
  if (octave === "-") return null;
  let offset = 0;
  for (const a of accidentals) offset += a === "#" || a === "s" ? 1 : -1;
  const oct = octave === "" ? DEFAULT_OCTAVE : parseInt(octave, 10);
  return (oct + 1) * 12 + SEMITONE_OF[letter.toLowerCase()] + offset;
}
__name(noteToMidi, "noteToMidi");
var SEMITONE_OF = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
var DEFAULT_OCTAVE = 3;

exports.noteToMidi = noteToMidi;
//# sourceMappingURL=noteToMidi.cjs.map
//# sourceMappingURL=noteToMidi.cjs.map