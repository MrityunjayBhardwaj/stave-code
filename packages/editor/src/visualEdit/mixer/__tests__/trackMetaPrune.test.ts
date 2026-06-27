import { describe, it, expect, beforeEach } from 'vitest'
import { pruneTrackMetaForCode } from '../trackMetaPrune'
import {
  createWorkspaceFile,
  setTrackMeta,
  getTrackMeta,
  __resetWorkspaceFilesForTests,
} from '../../../workspace/WorkspaceFile'

// #583 — the per-eval bridge: compute the current display-name set from code
// (the same buildStripModels projection the Mixer renders) and prune orphaned
// TrackMeta. The empty-set guard is the safety-critical part — a transient eval
// must never wipe the user's colours.
describe('pruneTrackMetaForCode (#583)', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
  })

  it('prunes overrides for tracks no longer present in the code, keyed by display name', () => {
    const code = ['drums: s("bd sn")', 'bass: note("c2 e2")'].join('\n')
    createWorkspaceFile('f1', 'p.strudel', code, 'strudel')
    setTrackMeta('f1', 'drums', { color: '#ff0000' })
    setTrackMeta('f1', 'bass', { color: '#00ff00' })
    setTrackMeta('f1', 'oldlead', { color: '#0000ff' }) // deleted from the code

    pruneTrackMetaForCode('f1', code)

    expect(getTrackMeta('f1', 'drums')).toEqual({ color: '#ff0000' })
    expect(getTrackMeta('f1', 'bass')).toEqual({ color: '#00ff00' })
    expect(getTrackMeta('f1', 'oldlead')).toEqual({}) // orphan pruned
  })

  it('NEVER wipes overrides when the code yields no strips (empty-set guard)', () => {
    createWorkspaceFile('f1', 'p.strudel', '', 'strudel')
    setTrackMeta('f1', 'drums', { color: '#ff0000' })

    pruneTrackMetaForCode('f1', '') // a transient/empty eval

    expect(getTrackMeta('f1', 'drums')).toEqual({ color: '#ff0000' }) // preserved
  })
})
