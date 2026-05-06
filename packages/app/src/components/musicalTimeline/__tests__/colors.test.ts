import { describe, it, expect } from 'vitest'
import {
  trackColorFromStem,
  STEM_DRUMS,
  STEM_BASS,
  STEM_PAD,
  STEM_MELODY,
  STEM_FALLBACK,
} from '../colors'

describe('trackColorFromStem — drum family (DV-04 / DV-11)', () => {
  const drumIds = ['bd', 'hh', 'sd', 'cp', 'hat', 'kick', 'snare', 'drum', 'perc', 'ride', 'crash', 'tom']
  for (const id of drumIds) {
    it(`maps "${id}" → STEM_DRUMS`, () => {
      expect(trackColorFromStem(id)).toBe(STEM_DRUMS)
    })
  }
})

describe('trackColorFromStem — bass family', () => {
  for (const id of ['bass', 'sub', '808']) {
    it(`maps "${id}" → STEM_BASS`, () => {
      expect(trackColorFromStem(id)).toBe(STEM_BASS)
    })
  }
})

describe('trackColorFromStem — pad family', () => {
  for (const id of ['pad', 'pads']) {
    it(`maps "${id}" → STEM_PAD`, () => {
      expect(trackColorFromStem(id)).toBe(STEM_PAD)
    })
  }
})

describe('trackColorFromStem — melody family', () => {
  for (const id of ['lead', 'melody', 'synth', 'piano', 'keys', 'guitar']) {
    it(`maps "${id}" → STEM_MELODY`, () => {
      expect(trackColorFromStem(id)).toBe(STEM_MELODY)
    })
  }
})

describe('trackColorFromStem — fallback (DV-04)', () => {
  it('returns STEM_FALLBACK for unknown ids', () => {
    expect(trackColorFromStem('xyz123')).toBe(STEM_FALLBACK)
  })

  it('returns STEM_FALLBACK for empty string', () => {
    expect(trackColorFromStem('')).toBe(STEM_FALLBACK)
  })

  it('STEM_FALLBACK equals STEM_MELODY (DV-04 spec)', () => {
    expect(STEM_FALLBACK).toBe(STEM_MELODY)
  })

  it('returns STEM_FALLBACK for the $default sentinel', () => {
    expect(trackColorFromStem('$default')).toBe(STEM_FALLBACK)
  })
})

describe('trackColorFromStem — sample outranks trackId (DV-11)', () => {
  it('uses sample when both are provided', () => {
    expect(trackColorFromStem('mystery-track', 'bd')).toBe(STEM_DRUMS)
    expect(trackColorFromStem('bd', 'pad')).toBe(STEM_PAD)
  })

  it('falls through to trackId when sample is undefined', () => {
    expect(trackColorFromStem('bass-line')).toBe(STEM_BASS)
  })
})

describe('trackColorFromStem — precedence ordering (DV-11)', () => {
  it('drums beat bass when both could match — drums earlier', () => {
    expect(trackColorFromStem('bd-bass')).toBe(STEM_DRUMS)
  })
})

describe('trackColorFromStem — case-insensitive', () => {
  it('uppercase BD matches drums', () => {
    expect(trackColorFromStem('BD')).toBe(STEM_DRUMS)
  })

  it('mixed-case Bass matches bass', () => {
    expect(trackColorFromStem('Bass')).toBe(STEM_BASS)
  })
})
