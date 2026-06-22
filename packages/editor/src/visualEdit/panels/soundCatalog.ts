/**
 * soundCatalog.ts — curated, GROUNDED option lists for the sound-assignment
 * pickers (#514 instrument, #515 kit, #516 add-voice).
 *
 * Every value here is verified against what the engine actually loads (spike
 * #427, doc artifacts/stave/GROUNDING-LOGIC-PARITY-427.md):
 *   - synth waveforms      → superdough/synth.mjs:23
 *   - `gm_*` soundfonts     → @strudel/soundfonts/gm.mjs (exact keys)
 *   - drum kits (`.bank`)   → live tidal-drum-machines.json (71 kits)
 *   - drum voice tokens     → the `_<voice>` suffixes in that same manifest
 *
 * This is a CURATED shortlist for the v1 pickers, not the authoritative
 * registry. PV141 #6: the eventual full-chrome pickers must enumerate the LIVE
 * `soundMap` (the manifests are CDN-loaded and can change). The write-back
 * itself is value-agnostic — it accepts any string — so this list bounds the
 * convenience UI, not the capability.
 */

export interface SoundOption {
  value: string
  label: string
}

export interface SoundGroup {
  group: string
  options: SoundOption[]
}

/** Piano Roll instrument picker (#514) — written as `.sound('value')`. */
export const INSTRUMENTS: SoundGroup[] = [
  {
    group: 'Synths',
    options: [
      { value: 'sawtooth', label: 'Sawtooth' },
      { value: 'square', label: 'Square' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'sine', label: 'Sine' },
    ],
  },
  {
    group: 'Keys',
    options: [
      { value: 'piano', label: 'Piano' },
      { value: 'gm_epiano1', label: 'E-Piano' },
      { value: 'gm_harpsichord', label: 'Harpsichord' },
      { value: 'gm_church_organ', label: 'Organ' },
      { value: 'gm_vibraphone', label: 'Vibraphone' },
      { value: 'gm_marimba', label: 'Marimba' },
    ],
  },
  {
    group: 'Strings',
    options: [
      { value: 'gm_violin', label: 'Violin' },
      { value: 'gm_cello', label: 'Cello' },
      { value: 'gm_string_ensemble_1', label: 'String Ensemble' },
      { value: 'gm_pizzicato_strings', label: 'Pizzicato Strings' },
    ],
  },
  {
    group: 'Winds & Brass',
    options: [
      { value: 'gm_alto_sax', label: 'Alto Sax' },
      { value: 'gm_tenor_sax', label: 'Tenor Sax' },
      { value: 'gm_flute', label: 'Flute' },
      { value: 'gm_clarinet', label: 'Clarinet' },
      { value: 'gm_trumpet', label: 'Trumpet' },
      { value: 'gm_trombone', label: 'Trombone' },
    ],
  },
  {
    group: 'Guitar & Bass',
    options: [
      { value: 'gm_acoustic_guitar_nylon', label: 'Nylon Guitar' },
      { value: 'gm_electric_guitar_clean', label: 'Electric Guitar' },
      { value: 'gm_acoustic_bass', label: 'Acoustic Bass' },
      { value: 'gm_synth_bass_1', label: 'Synth Bass' },
    ],
  },
  {
    group: 'Voice & Pad',
    options: [
      { value: 'gm_choir_aahs', label: 'Choir' },
      { value: 'gm_pad_warm', label: 'Warm Pad' },
      { value: 'gm_lead_2_sawtooth', label: 'Saw Lead' },
    ],
  },
]

/** Sequencer kit picker (#515) — written as `.bank('value')`. 71 kits, grouped
 *  by manufacturer for the dropdown; the bare TR-808/909 lead since they're the
 *  most-reached-for. */
export const DRUM_KITS: SoundGroup[] = [
  {
    group: 'Roland',
    options: [
      { value: 'RolandTR808', label: 'Roland TR-808' },
      { value: 'RolandTR909', label: 'Roland TR-909' },
      { value: 'RolandTR707', label: 'Roland TR-707' },
      { value: 'RolandTR727', label: 'Roland TR-727' },
      { value: 'RolandTR606', label: 'Roland TR-606' },
      { value: 'RolandTR505', label: 'Roland TR-505' },
      { value: 'RolandTR626', label: 'Roland TR-626' },
      { value: 'RolandCompurhythm1000', label: 'Roland CR-1000' },
      { value: 'RolandCompurhythm78', label: 'Roland CR-78' },
      { value: 'RolandR8', label: 'Roland R-8' },
    ],
  },
  {
    group: 'Yamaha',
    options: [
      { value: 'YamahaRX5', label: 'Yamaha RX5' },
      { value: 'YamahaRX21', label: 'Yamaha RX21' },
      { value: 'YamahaRY30', label: 'Yamaha RY30' },
      { value: 'YamahaRM50', label: 'Yamaha RM50' },
      { value: 'YamahaTG33', label: 'Yamaha TG33' },
    ],
  },
  {
    group: 'Akai',
    options: [
      { value: 'AkaiLinn', label: 'Akai Linn' },
      { value: 'AkaiMPC60', label: 'Akai MPC60' },
      { value: 'AkaiXR10', label: 'Akai XR10' },
    ],
  },
  {
    group: 'Linn',
    options: [
      { value: 'LinnDrum', label: 'LinnDrum' },
      { value: 'LinnLM1', label: 'Linn LM-1' },
      { value: 'LinnLM2', label: 'Linn LM-2' },
      { value: 'Linn9000', label: 'Linn 9000' },
    ],
  },
  {
    group: 'Other classics',
    options: [
      { value: 'AlesisHR16', label: 'Alesis HR-16' },
      { value: 'AlesisSR16', label: 'Alesis SR-16' },
      { value: 'BossDR55', label: 'Boss DR-55' },
      { value: 'BossDR110', label: 'Boss DR-110' },
      { value: 'BossDR550', label: 'Boss DR-550' },
      { value: 'CasioRZ1', label: 'Casio RZ-1' },
      { value: 'EmuDrumulator', label: 'E-mu Drumulator' },
      { value: 'EmuSP12', label: 'E-mu SP-12' },
      { value: 'KorgKR55', label: 'Korg KR-55' },
      { value: 'KorgMinipops', label: 'Korg Mini Pops' },
      { value: 'OberheimDMX', label: 'Oberheim DMX' },
      { value: 'SequentialCircuitsDrumtracks', label: 'Sequential Drumtraks' },
      { value: 'SimmonsSDS5', label: 'Simmons SDS-5' },
      { value: 'RhythmAce', label: 'Rhythm Ace' },
    ],
  },
]

/** Add-voice picker (#516) — the standard tidal drum voice tokens. */
export const DRUM_SOUNDS: SoundOption[] = [
  { value: 'bd', label: 'Kick (bd)' },
  { value: 'sd', label: 'Snare (sd)' },
  { value: 'rim', label: 'Rim (rim)' },
  { value: 'cp', label: 'Clap (cp)' },
  { value: 'hh', label: 'Hi-Hat (hh)' },
  { value: 'oh', label: 'Open Hat (oh)' },
  { value: 'lt', label: 'Low Tom (lt)' },
  { value: 'mt', label: 'Mid Tom (mt)' },
  { value: 'ht', label: 'Hi Tom (ht)' },
  { value: 'cr', label: 'Crash (cr)' },
  { value: 'rd', label: 'Ride (rd)' },
  { value: 'sh', label: 'Shaker (sh)' },
  { value: 'cb', label: 'Cowbell (cb)' },
  { value: 'perc', label: 'Perc (perc)' },
  { value: 'tb', label: 'Tambourine (tb)' },
]
