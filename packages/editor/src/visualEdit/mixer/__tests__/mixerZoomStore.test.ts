/**
 * mixerZoomStore — the pure clamp + parse boundaries (#759).
 *
 * The localStorage round-trip + cross-mount re-render are covered by Playwright
 * (jsdom's localStorage stub here is non-functional). These lock the pure
 * boundaries: a corrupt or out-of-range persisted value must degrade to a safe
 * scale, never throw or propagate — a bad value can't be allowed to break the
 * Mixer or blow up a strip's CSS `zoom`.
 */
import { describe, it, expect } from 'vitest'

import {
  clampMixerZoom,
  parseMixerZoom,
  MIXER_ZOOM_MIN,
  MIXER_ZOOM_MAX,
  MIXER_ZOOM_DEFAULT,
  MIXER_ZOOM_STEP,
} from '../mixerZoomStore'

describe('clampMixerZoom', () => {
  it('passes an in-range value through', () => {
    expect(clampMixerZoom(1)).toBe(1)
    expect(clampMixerZoom(1.3)).toBe(1.3)
  })

  it('clamps below MIN and above MAX to the bounds', () => {
    expect(clampMixerZoom(0.1)).toBe(MIXER_ZOOM_MIN)
    expect(clampMixerZoom(-5)).toBe(MIXER_ZOOM_MIN)
    expect(clampMixerZoom(99)).toBe(MIXER_ZOOM_MAX)
  })

  it('snaps to 2 decimals so additive steps cannot drift', () => {
    // 1 + 0.1 + 0.1 in float is 1.2000000000000002 — must read back clean.
    expect(clampMixerZoom(1 + MIXER_ZOOM_STEP + MIXER_ZOOM_STEP)).toBe(1.2)
  })

  it('degrades a non-finite value to the default instead of propagating', () => {
    expect(clampMixerZoom(NaN)).toBe(MIXER_ZOOM_DEFAULT)
    expect(clampMixerZoom(Infinity)).toBe(MIXER_ZOOM_DEFAULT)
    expect(clampMixerZoom(-Infinity)).toBe(MIXER_ZOOM_DEFAULT)
  })
})

describe('parseMixerZoom', () => {
  it('returns the default for null / missing', () => {
    expect(parseMixerZoom(null)).toBe(MIXER_ZOOM_DEFAULT)
  })

  it('parses a JSON number and clamps it', () => {
    expect(parseMixerZoom('1.4')).toBe(1.4)
    expect(parseMixerZoom('9')).toBe(MIXER_ZOOM_MAX)
    expect(parseMixerZoom('0')).toBe(MIXER_ZOOM_MIN)
  })

  it('degrades a non-number JSON value to the default', () => {
    expect(parseMixerZoom('"1.4"')).toBe(MIXER_ZOOM_DEFAULT)
    expect(parseMixerZoom('true')).toBe(MIXER_ZOOM_DEFAULT)
    expect(parseMixerZoom('[1.4]')).toBe(MIXER_ZOOM_DEFAULT)
    expect(parseMixerZoom('{"z":1.4}')).toBe(MIXER_ZOOM_DEFAULT)
  })

  it('degrades malformed JSON to the default instead of throwing', () => {
    expect(parseMixerZoom('1.4}')).toBe(MIXER_ZOOM_DEFAULT)
    expect(parseMixerZoom('not json')).toBe(MIXER_ZOOM_DEFAULT)
  })
})
