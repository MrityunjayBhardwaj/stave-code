/**
 * strudelControls.ts — the full vocabulary of Strudel CONTROLS (effect/param
 * names created by `registerControl`/`createParam`), harvested from
 * `@strudel/core@1.2.6` controls.mjs. 370 names incl. aliases.
 *
 * WHY the Mixer needs this: every control is a UNARY chainable method
 * (`Pattern.prototype[name] = function (value) {…}`, controls.mjs:50) — it
 * reads ONLY its first argument, so any extra positional numbers are ignored at
 * runtime. The drawer uses this to (a) cap a control to ONE dial (never a
 * phantom `chorus 2`/`chorus 3` for args Strudel discards, #842 class) and
 * (b) know that a control's args 2+ are safe to carry range metadata (#844).
 * Non-controls (euclid/range/ply/chop/…) are NOT here — their args are real.
 *
 * Regenerate on a @strudel bump: extract string args of every registerControl(…)
 * call in controls.mjs. Pure data — no imports.
 */
export const STRUDEL_CONTROLS: ReadonlySet<string> = new Set([
  'FXr', 'FXrel', 'FXrelease', 'accelerate', 'activeLabel', 'amp', 'analyze', 'anchor',
  'att', 'attack', 'bandf', 'bandq', 'bank', 'bbexpr', 'bbst', 'begin',
  'bgain', 'binshift', 'bp', 'bpa', 'bpattack', 'bpd', 'bpdc', 'bpdecay',
  'bpdepth', 'bpdepthfreq', 'bpdepthfrequency', 'bpe', 'bpenv', 'bpf', 'bpq', 'bpr',
  'bprate', 'bprelease', 'bps', 'bpshape', 'bpskew', 'bpsustain', 'bpsync', 'bus',
  'busgain', 'byteBeatExpression', 'byteBeatStartTime', 'ccn', 'ccv', 'ch', 'channel', 'channels',
  'chord', 'chorus', 'clip', 'coarse', 'color', 'colour', 'comb', 'compressor',
  'compressorAttack', 'compressorKnee', 'compressorRatio', 'compressorRelease', 'cps', 'crush', 'ctf', 'ctlNum',
  'ctranspose', 'curve', 'cut', 'cutoff', 'dec', 'decay', 'degree', 'delay',
  'delayfb', 'delayfeedback', 'delayspeed', 'delaysync', 'delayt', 'delaytime', 'deltaSlide', 'density',
  'det', 'detune', 'dfb', 'dict', 'dictionary', 'dist', 'distort', 'distorttype',
  'distortvol', 'disttype', 'distvol', 'djf', 'drive', 'dry', 'dt', 'duck',
  'duckatt', 'duckattack', 'duckdepth', 'duckons', 'duckonset', 'duckorbit', 'dur', 'duration',
  'end', 'enhance', 'expression', 'fadeInTime', 'fadeOutTime', 'fadeTime', 'fanchor', 'fft',
  'frameRate', 'frames', 'freeze', 'freq', 'fshift', 'fshiftnote', 'fshiftphase', 'ftype',
  'fxr', 'gain', 'gat', 'gate', 'harmonic', 'hbrick', 'hcutoff', 'hold',
  'hours', 'hp', 'hpa', 'hpattack', 'hpd', 'hpdc', 'hpdecay', 'hpdepth',
  'hpdepthfreq', 'hpdepthfrequency', 'hpe', 'hpenv', 'hpf', 'hpq', 'hpr', 'hprate',
  'hprelease', 'hps', 'hpshape', 'hpskew', 'hpsustain', 'hpsync', 'hresonance', 'i',
  'imag', 'ir', 'irbegin', 'iresponse', 'irspeed', 'kcutoff', 'krush', 'label',
  'lbrick', 'legato', 'leslie', 'lock', 'loop', 'loopBegin', 'loopEnd', 'loopb',
  'loope', 'lp', 'lpa', 'lpattack', 'lpd', 'lpdc', 'lpdecay', 'lpdepth',
  'lpdepthfreq', 'lpdepthfrequency', 'lpe', 'lpenv', 'lpf', 'lpq', 'lpr', 'lprate',
  'lprelease', 'lps', 'lpshape', 'lpskew', 'lpsustain', 'lpsync', 'lrate', 'lsize',
  'midibend', 'midichan', 'midicmd', 'midimap', 'midiport', 'miditouch', 'minutes', 'mode',
  'mtranspose', 'n', 'noise', 'note', 'nrpnn', 'nrpv', 'nudge', 'o',
  'oct', 'octave', 'octaveR', 'octaves', 'octer', 'octersub', 'octersubsub', 'offset',
  'orbit', 'oschost', 'oscport', 'overgain', 'overshape', 'pan', 'panchor', 'panorient',
  'panspan', 'pansplay', 'panwidth', 'patt', 'pattack', 'pcurve', 'pdec', 'pdecay',
  'penv', 'ph', 'phasdp', 'phaser', 'phasercenter', 'phaserdepth', 'phaserrate', 'phasersweep',
  'phc', 'phd', 'phs', 'pitchJump', 'pitchJumpTime', 'polyTouch', 'postgain', 'prel',
  'prelease', 'progNum', 'psus', 'psustain', 'pw', 'pwrate', 'pwsweep', 'rdim',
  'real', 'rel', 'release', 'resonance', 'rfade', 'ring', 'ringdf', 'ringf',
  'rlp', 'room', 'roomdim', 'roomfade', 'roomlp', 'roomsize', 'rsize', 's',
  'scram', 'seconds', 'semitone', 'shape', 'shapevol', 'size', 'slide', 'smear',
  'songPtr', 'sound', 'source', 'speed', 'spread', 'squiz', 'src', 'stepsPerOctave',
  'stretch', 'sus', 'sustain', 'sustainpedal', 'sysexdata', 'sysexid', 'sz', 'transient',
  'transsustain', 'trem', 'tremdepth', 'tremolo', 'tremolodepth', 'tremolophase', 'tremoloshape', 'tremoloskew',
  'tremolosync', 'tremphase', 'tremshape', 'tremskew', 'tremsync', 'triode', 'tsdelay', 'uid',
  'unison', 'unit', 'v', 'val', 'vel', 'velocity', 'vib', 'vibmod',
  'vibrato', 'vmod', 'voice', 'vowel', 'warp', 'warpatt', 'warpattack', 'warpdc',
  'warpdec', 'warpdecay', 'warpdepth', 'warpenv', 'warpmode', 'warprate', 'warprel', 'warprelease',
  'warpshape', 'warpskew', 'warpsus', 'warpsustain', 'warpsync', 'waveloss', 'wavetablePhaseRand', 'wavetablePosition',
  'wavetableWarp', 'wavetableWarpMode', 'wt', 'wtatt', 'wtattack', 'wtdc', 'wtdec', 'wtdecay',
  'wtdepth', 'wtenv', 'wtphaserand', 'wtrate', 'wtrel', 'wtrelease', 'wtshape', 'wtskew',
  'wtsus', 'wtsustain', 'wtsync', 'xsdelay', 'zcrush', 'zdelay', 'zmod', 'znoise',
  'zrand', 'zzfx',
])
