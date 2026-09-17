import { describe, it, expect } from 'vitest'

import { detectAllChunks } from '../../chunkDetect'
import { buildStripModels } from '../stripModel'
import { stemFileNames, SONG_LEVEL_STEM_NAME } from '../stemNames'
import { SONG_LEVEL_STEM } from '../../../engine/stemSplit'

/**
 * #1648 — a stem file is named as the mixer strip for the same track is named,
 * joined on the capture id the strip already carries for its meter.
 */

const DOC = `setcps(0.5)
drums: s("bd sd")
$: note("c3 e3").s("sawtooth")
_$: s("hh*8")
$: s("cp*2")`

describe('stemFileNames (#1648)', () => {
  it('names each stem after its mixer strip, numbered in document order', () => {
    const strips = buildStripModels(detectAllChunks(DOC)).filter((s) => !s.muted)
    const ids = strips.map((s) => s.captureId)
    const names = stemFileNames(DOC, ids)
    expect(names).toEqual(strips.map((s, i) => `${String(i + 1).padStart(2, '0')}-${s.name.replace(/[^a-z0-9_-]+/gi, '_')}.wav`))
    // And concretely, so a change to what the strips are called shows up here too.
    expect(ids).toEqual(['drums', '$0', '$1'])
    expect(names[0]).toBe('01-drums.wav')
  })

  it('the song-level stem gets its own name', () => {
    expect(stemFileNames(DOC, ['drums', SONG_LEVEL_STEM])).toEqual(['01-drums.wav', `02-${SONG_LEVEL_STEM_NAME}.wav`])
  })

  it('an id no strip carries keeps the id, made file-safe', () => {
    expect(stemFileNames(DOC, ['$9'])).toEqual(['01-9.wav'])
  })

  it('two tracks with the same name get distinct files', () => {
    // An anonymous second track is shown as \`d2\`, the name the first one chose.
    const doc = `d2: s("bd*2")\n$: s("hh*4")`
    const strips = buildStripModels(detectAllChunks(doc))
    expect(strips.map((s) => s.name)).toEqual(['d2', 'd2'])
    expect(stemFileNames(doc, strips.map((s) => s.captureId))).toEqual(['01-d2.wav', '02-d2-2.wav'])
  })

  it('a document the chunker cannot read still names its stems', () => {
    expect(stemFileNames('this is ( not code', ['$0'])).toEqual(['01-0.wav'])
  })
})
