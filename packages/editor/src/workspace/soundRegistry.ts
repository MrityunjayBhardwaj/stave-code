/**
 * soundRegistry — live instrument enumeration for the visual-edit pickers
 * (#514 instrument picker; PV141 #6: enumerate the LIVE registry, not a curated
 * list).
 *
 * The engine (superdough) registers ~1800 sounds into its `soundMap` store as
 * samples load from the CDN. Each entry carries `data.type`
 * (`synth` | `soundfont` | `sample`) and an optional `data.tag`
 * (`drum-machines` for the kit voices). GROUNDED by observing the live
 * `window.soundMap.get()` in the running engine (see #427 + the spike): 1852
 * entries, types as above, `drum-machines` the only tag.
 *
 * The visual-edit panels live in the editor package and have no direct line to
 * the engine, so the APP registers a reader here (mirrors `currentCycle.ts`):
 * the app owns the engine/superdough and reads its `soundMap`; the panels read
 * the grouped catalog through `useSoundCatalog()` and fall back to the curated
 * `soundCatalog.ts` until the live list is available.
 *
 * Banks (`.bank("RolandTR909")`) are NOT soundMap keys — the drum-machine
 * entries are the bare voices (`bd`/`sd`), and the bank is a separate manifest
 * dimension. So the kit picker stays on the curated (manifest-grounded) list;
 * live-bank enumeration would need the `tidal-drum-machines.json` manifest (a
 * follow-up).
 */
import * as React from 'react'

import type { SoundGroup } from '../visualEdit/panels/soundCatalog'

/** The minimal shape we read off a superdough soundMap entry. */
export interface SoundMapEntry {
  data?: { type?: string; tag?: string }
}

/** A superdough soundMap dictionary: name → entry. */
export type SoundMapDict = Record<string, SoundMapEntry>

/** Strip a `gm_` soundfont id to a friendly label: `gm_alto_sax` → `Alto Sax`. */
function soundfontLabel(name: string): string {
  return name
    .replace(/^gm_/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Title-case a bare synth/sample id: `sawtooth` → `Sawtooth`. */
function simpleLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Group a live soundMap dictionary into the melodic-instrument picker's
 * `SoundGroup[]` (#514). Synths and soundfonts are the relevant melodic
 * instruments for a `note(...).sound(...)`; bare samples are offered too but
 * the drum-machine voices (`tag: 'drum-machines'`) and superdough internals
 * (`_`-prefixed) are excluded — they belong to the Sequencer's kit/voice model,
 * not a melodic picker. Each group is sorted; empty groups are dropped. Returns
 * `null` when the dict is empty/absent so callers can fall back to the curated
 * list.
 */
export function groupSoundCatalog(dict: SoundMapDict | null | undefined): SoundGroup[] | null {
  if (!dict) return null
  const synths: string[] = []
  const soundfonts: string[] = []
  const samples: string[] = []
  for (const name of Object.keys(dict)) {
    if (name.startsWith('_')) continue
    const data = dict[name]?.data
    if (data?.tag === 'drum-machines') continue // kit voices, not melodic
    switch (data?.type) {
      case 'synth':
        synths.push(name)
        break
      case 'soundfont':
        soundfonts.push(name)
        break
      case 'sample':
        samples.push(name)
        break
      default:
        break
    }
  }
  if (synths.length + soundfonts.length + samples.length === 0) return null
  const groups: SoundGroup[] = []
  if (synths.length) {
    groups.push({
      group: 'Synths',
      options: synths.sort().map((v) => ({ value: v, label: simpleLabel(v) })),
    })
  }
  if (soundfonts.length) {
    groups.push({
      group: 'Soundfonts',
      options: soundfonts.sort().map((v) => ({ value: v, label: soundfontLabel(v) })),
    })
  }
  if (samples.length) {
    groups.push({
      group: 'Samples',
      options: samples.sort().map((v) => ({ value: v, label: simpleLabel(v) })),
    })
  }
  return groups
}

// ── accessor registry + change notification (mirrors currentCycle.ts) ──

type CatalogAccessor = () => SoundGroup[] | null

let accessor: CatalogAccessor | null = null
const listeners = new Set<() => void>()

// CACHED snapshot. `groupSoundCatalog` builds a NEW array each call, so calling
// the accessor on every `getSnapshot` would return a fresh reference every
// render and drive `useSyncExternalStore` into an infinite loop. We recompute
// ONLY on a notify (accessor set, or the app reports the soundMap changed) and
// hand out the same reference in between — a stable snapshot.
let cached: SoundGroup[] | null = null

function recompute(): void {
  if (!accessor) {
    cached = null
    return
  }
  try {
    cached = accessor()
  } catch {
    cached = null
  }
}

/** App registers the live-catalog reader (or null to clear). */
export function setSoundCatalogAccessor(fn: CatalogAccessor | null): void {
  accessor = fn
  recompute()
  listeners.forEach((l) => l())
}

/** App calls this when the soundMap changes (samples finished loading). */
export function notifySoundCatalogChanged(): void {
  recompute()
  listeners.forEach((l) => l())
}

/** The current live instrument catalog (cached, stable between notifies). */
export function readSoundCatalog(): SoundGroup[] | null {
  return cached
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The live instrument catalog for the pickers, re-rendering when the soundMap
 * grows (samples load async after engine init). Returns null until the live
 * list is available — callers fall back to the curated `INSTRUMENTS`.
 */
export function useSoundCatalog(): SoundGroup[] | null {
  return React.useSyncExternalStore(
    subscribe,
    () => readSoundCatalog(),
    () => null,
  )
}
