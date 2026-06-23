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
 * Drum kits (`.bank("RolandTR909")`, #515) come from the `tidal-drum-machines`
 * manifest rather than the soundMap: that manifest's keys are `Bank_voice`
 * (`RolandTR909_bd`), so a bank name is the key prefix before the last `_`. The
 * app fetches the manifest and feeds the derived bank names through a parallel
 * kit store (`groupDrumKits` + `useDrumKitCatalog`); the picker falls back to
 * the curated `DRUM_KITS` until the fetch resolves. (uzu-drumkit registers bare
 * voices `bd`/`hh` with no bank prefix — those are correctly skipped.)
 */
import * as React from 'react'

import type { SoundGroup, SoundOption } from '../visualEdit/panels/soundCatalog'

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

// ── drum kits (#515) ────────────────────────────────────────────────────────
//
// Drum banks load from the `tidal-drum-machines.json` manifest (the engine
// fetches it at StrudelEngine init, StrudelEngine.ts:365). Its keys are
// `Bank_voice` (`RolandTR909_bd`), so a bank name is the key up to the LAST
// `_`. The app fetches the manifest and feeds the derived bank names here.

/** A drum-machine sample manifest: `Bank_voice` key → sample url list. */
export type DrumMachineManifest = Record<string, unknown>

/**
 * Distinct bank names from a drum-machine manifest: the key prefix before the
 * last `_`. `_`-internals (`_base`) and bare-voice keys (no `_`, e.g.
 * uzu-drumkit's `bd`/`hh`) are skipped. Sorted for stable display.
 */
export function banksFromDrumMachineManifest(
  manifest: DrumMachineManifest | null | undefined,
): string[] {
  if (!manifest) return []
  const banks = new Set<string>()
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('_')) continue
    const i = key.lastIndexOf('_')
    if (i <= 0) continue // bare voice (no bank prefix)
    banks.add(key.slice(0, i))
  }
  return [...banks].sort()
}

// Major makers get their own group (UX parity with the curated list this
// replaces); every other bank falls to "Other". DISPLAY-ONLY grouping — which
// banks appear is 100% the live manifest, not this list.
const KIT_MAKERS: { prefix: string; group: string }[] = [
  { prefix: 'Roland', group: 'Roland' },
  { prefix: 'Yamaha', group: 'Yamaha' },
  { prefix: 'Akai', group: 'Akai' },
  { prefix: 'Korg', group: 'Korg' },
  { prefix: 'Boss', group: 'Boss' },
  { prefix: 'Casio', group: 'Casio' },
  { prefix: 'Alesis', group: 'Alesis' },
  { prefix: 'Emu', group: 'E-mu' },
  { prefix: 'Linn', group: 'Linn' },
  { prefix: 'Oberheim', group: 'Oberheim' },
  { prefix: 'SequentialCircuits', group: 'Sequential' },
  { prefix: 'Simmons', group: 'Simmons' },
]
const KIT_GROUP_ORDER = [
  'Roland', 'Yamaha', 'Akai', 'Korg', 'Boss', 'Casio', 'Alesis', 'E-mu',
  'Linn', 'Oberheim', 'Sequential', 'Simmons', 'Other',
]

/** Insert spaces at camelCase boundaries: `ConcertMate` → `Concert Mate`. */
function spaceCamel(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
}

/**
 * Group live bank names into the Kit picker's `SoundGroup[]` (#515). Banks are
 * grouped by major manufacturer (the rest → "Other"); the option VALUE is the
 * exact bank string (what `.bank('…')` writes), the label strips the maker
 * prefix and spaces out camelCase. Returns null when empty so callers fall back
 * to the curated `DRUM_KITS`.
 */
export function groupDrumKits(
  bankNames: string[] | null | undefined,
): SoundGroup[] | null {
  if (!bankNames || bankNames.length === 0) return null
  const byGroup = new Map<string, SoundOption[]>()
  for (const bank of bankNames) {
    const maker = KIT_MAKERS.find((m) => bank.startsWith(m.prefix))
    const group = maker?.group ?? 'Other'
    const rest = maker ? bank.slice(maker.prefix.length) : bank
    const label = spaceCamel(rest) || bank
    const opts = byGroup.get(group) ?? []
    opts.push({ value: bank, label })
    byGroup.set(group, opts)
  }
  const groups: SoundGroup[] = []
  for (const group of KIT_GROUP_ORDER) {
    const opts = byGroup.get(group)
    if (opts && opts.length) {
      groups.push({
        group,
        options: opts.sort((a, b) => a.label.localeCompare(b.label)),
      })
    }
  }
  return groups.length ? groups : null
}

// ── accessor registry + change notification (mirrors currentCycle.ts) ──
//
// Both pickers share the same shape: the app registers a reader over live engine
// state, the panel subscribes via `useSyncExternalStore`. The accessor builds a
// NEW array each call, so we CACHE the snapshot and recompute only on a notify —
// handing out a stable reference between notifies keeps `useSyncExternalStore`
// from looping (PV144). `createCatalogStore` factors out that machinery so each
// catalog (instruments #514, kits #515) is one instance.

type CatalogAccessor = () => SoundGroup[] | null

interface CatalogStore {
  setAccessor: (fn: CatalogAccessor | null) => void
  notify: () => void
  read: () => SoundGroup[] | null
  useCatalog: () => SoundGroup[] | null
}

function createCatalogStore(): CatalogStore {
  let accessor: CatalogAccessor | null = null
  let cached: SoundGroup[] | null = null
  const listeners = new Set<() => void>()

  const recompute = (): void => {
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
  const setAccessor = (fn: CatalogAccessor | null): void => {
    accessor = fn
    recompute()
    listeners.forEach((l) => l())
  }
  const notify = (): void => {
    recompute()
    listeners.forEach((l) => l())
  }
  const read = (): SoundGroup[] | null => cached
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const useCatalog = (): SoundGroup[] | null =>
    React.useSyncExternalStore(subscribe, read, () => null)
  return { setAccessor, notify, read, useCatalog }
}

// Instrument catalog (#514 / PV141 #6) — synths/soundfonts/samples from the
// live soundMap.
const instrumentStore = createCatalogStore()

/** App registers the live instrument-catalog reader (or null to clear). */
export const setSoundCatalogAccessor = instrumentStore.setAccessor
/** App calls this when the soundMap changes (samples finished loading). */
export const notifySoundCatalogChanged = instrumentStore.notify
/** The current live instrument catalog (cached, stable between notifies). */
export const readSoundCatalog = instrumentStore.read
/**
 * The live instrument catalog for the pickers, re-rendering when the soundMap
 * grows (samples load async after engine init). Returns null until the live
 * list is available — callers fall back to the curated `INSTRUMENTS`.
 */
export const useSoundCatalog = instrumentStore.useCatalog

// Drum-kit catalog (#515 / PV141 #6) — bank names from the drum-machine
// manifest, grouped by manufacturer.
const drumKitStore = createCatalogStore()

/** App registers the live drum-kit reader (or null to clear). */
export const setDrumKitAccessor = drumKitStore.setAccessor
/** App calls this when the live drum-kit list is ready. */
export const notifyDrumKitChanged = drumKitStore.notify
/** The current live drum-kit catalog (cached, stable between notifies). */
export const readDrumKitCatalog = drumKitStore.read
/**
 * The live drum-kit catalog for the Kit picker. Returns null until the manifest
 * fetch resolves — callers fall back to the curated `DRUM_KITS`.
 */
export const useDrumKitCatalog = drumKitStore.useCatalog
