/**
 * General MIDI soundfont families (#807) — sub-categorise the ~125 `gm_*`
 * soundfonts by their well-known instrument family so both melodic pickers can
 * show "Soundfonts · Strings" / "· Brass" / … instead of one flat "Soundfonts"
 * bucket of 125 rows (which regressed browsability vs. the old curated list).
 *
 * SHARED domain knowledge: the GM program→family split is one spec fact, and it
 * has TWO consumers — the Mixer's melodic `<select>` (`groupSoundCatalog`) and
 * the Asset Library's Sounds provider (`classify`). Keeping the map + the group
 * label in ONE module means the two surfaces can never drift apart (PV168:
 * extract shares the CODE, not just a copied constant).
 *
 * GROUNDED in the vendored `@strudel/soundfonts@1.3.0` `gm.mjs`: its 125
 * top-level `gm_*` keys are exactly the names superdough registers into the live
 * `soundMap` (`registerSoundfonts` iterates that object), and each key's family
 * is read straight from gm.mjs's `// <Instrument>: <Family>` annotations. The 16
 * families are the canonical GM sound-set groups (Piano has 5 keys, not 8,
 * because strudel merges the four acoustic-grand variants into `gm_piano`).
 *
 * If a NEW upstream `gm_*` key ever appears that isn't in this map, `gmFamily`
 * returns null and `soundfontGroupLabel` falls back to the flat "Soundfonts"
 * bucket — never dropped, just ungrouped (the include-by-default rule, P254).
 */

/** The 16 GM families, in canonical program order — the display order for the
 *  `Soundfonts · <Family>` groups. */
export const GM_FAMILY_ORDER = [
  'Piano',
  'Chromatic Percussion',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Synth Lead',
  'Synth Pad',
  'Synth Effects',
  'Ethnic',
  'Percussive',
  'Sound Effects',
] as const

export type GmFamily = (typeof GM_FAMILY_ORDER)[number]

/** Family → its `gm_*` keys, in GM order. The literal is generated from
 *  gm.mjs; the inverse lookup below is what callers use. */
const GM_FAMILY_KEYS: Record<GmFamily, readonly string[]> = {
  'Piano': ['gm_piano', 'gm_epiano1', 'gm_epiano2', 'gm_harpsichord', 'gm_clavinet'],
  'Chromatic Percussion': ['gm_celesta', 'gm_glockenspiel', 'gm_music_box', 'gm_vibraphone', 'gm_marimba', 'gm_xylophone', 'gm_tubular_bells', 'gm_dulcimer'],
  'Organ': ['gm_drawbar_organ', 'gm_percussive_organ', 'gm_rock_organ', 'gm_church_organ', 'gm_reed_organ', 'gm_accordion', 'gm_harmonica', 'gm_bandoneon'],
  'Guitar': ['gm_acoustic_guitar_nylon', 'gm_acoustic_guitar_steel', 'gm_electric_guitar_jazz', 'gm_electric_guitar_clean', 'gm_electric_guitar_muted', 'gm_overdriven_guitar', 'gm_distortion_guitar', 'gm_guitar_harmonics'],
  'Bass': ['gm_acoustic_bass', 'gm_electric_bass_finger', 'gm_electric_bass_pick', 'gm_fretless_bass', 'gm_slap_bass_1', 'gm_slap_bass_2', 'gm_synth_bass_1', 'gm_synth_bass_2'],
  'Strings': ['gm_violin', 'gm_viola', 'gm_cello', 'gm_contrabass', 'gm_tremolo_strings', 'gm_pizzicato_strings', 'gm_orchestral_harp', 'gm_timpani'],
  'Ensemble': ['gm_string_ensemble_1', 'gm_string_ensemble_2', 'gm_synth_strings_1', 'gm_synth_strings_2', 'gm_choir_aahs', 'gm_voice_oohs', 'gm_synth_choir', 'gm_orchestra_hit'],
  'Brass': ['gm_trumpet', 'gm_trombone', 'gm_tuba', 'gm_muted_trumpet', 'gm_french_horn', 'gm_brass_section', 'gm_synth_brass_1', 'gm_synth_brass_2'],
  'Reed': ['gm_soprano_sax', 'gm_alto_sax', 'gm_tenor_sax', 'gm_baritone_sax', 'gm_oboe', 'gm_english_horn', 'gm_bassoon', 'gm_clarinet'],
  'Pipe': ['gm_piccolo', 'gm_flute', 'gm_recorder', 'gm_pan_flute', 'gm_blown_bottle', 'gm_shakuhachi', 'gm_whistle', 'gm_ocarina'],
  'Synth Lead': ['gm_lead_1_square', 'gm_lead_2_sawtooth', 'gm_lead_3_calliope', 'gm_lead_4_chiff', 'gm_lead_5_charang', 'gm_lead_6_voice', 'gm_lead_7_fifths', 'gm_lead_8_bass_lead'],
  'Synth Pad': ['gm_pad_new_age', 'gm_pad_warm', 'gm_pad_poly', 'gm_pad_choir', 'gm_pad_bowed', 'gm_pad_metallic', 'gm_pad_halo', 'gm_pad_sweep'],
  'Synth Effects': ['gm_fx_rain', 'gm_fx_soundtrack', 'gm_fx_crystal', 'gm_fx_atmosphere', 'gm_fx_brightness', 'gm_fx_goblins', 'gm_fx_echoes', 'gm_fx_sci_fi'],
  'Ethnic': ['gm_sitar', 'gm_banjo', 'gm_shamisen', 'gm_koto', 'gm_kalimba', 'gm_bagpipe', 'gm_fiddle', 'gm_shanai'],
  'Percussive': ['gm_tinkle_bell', 'gm_agogo', 'gm_steel_drums', 'gm_woodblock', 'gm_taiko_drum', 'gm_melodic_tom', 'gm_synth_drum', 'gm_reverse_cymbal'],
  'Sound Effects': ['gm_guitar_fret_noise', 'gm_breath_noise', 'gm_seashore', 'gm_bird_tweet', 'gm_telephone', 'gm_helicopter', 'gm_applause', 'gm_gunshot'],
}

/** Inverse lookup `gm_*` key → family, built once at module load. */
const KEY_TO_FAMILY: ReadonlyMap<string, GmFamily> = (() => {
  const m = new Map<string, GmFamily>()
  for (const family of GM_FAMILY_ORDER) {
    for (const key of GM_FAMILY_KEYS[family]) m.set(key, family)
  }
  return m
})()

/** Total mapped keys — exposed so tests can assert the map stays in sync with
 *  the vendored gm.mjs (125 as of @strudel/soundfonts@1.3.0). */
export const GM_FAMILY_KEY_COUNT = KEY_TO_FAMILY.size

/**
 * The GM family for a soundfont key, or null when the key isn't a mapped
 * `gm_*` soundfont (a bare/custom soundfont, or a new upstream key not yet in
 * the map — the caller keeps it in the flat "Soundfonts" bucket, never drops).
 */
export function gmFamily(name: string): GmFamily | null {
  return KEY_TO_FAMILY.get(name) ?? null
}

/**
 * The group label for a soundfont: `Soundfonts · <Family>` for a mapped `gm_*`
 * key, else the flat `Soundfonts`. Both pickers use THIS so the label format is
 * defined once. The `Soundfonts · ` prefix (matching `Drums · <bank>`) keeps all
 * soundfonts clustered where the Asset Library sorts rows by group.
 */
export function soundfontGroupLabel(name: string): string {
  const family = gmFamily(name)
  return family ? `Soundfonts · ${family}` : 'Soundfonts'
}
