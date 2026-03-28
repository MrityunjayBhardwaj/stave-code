/**
 * Propagation engine — ordered system execution over a component bag.
 *
 * Systems are pure functions that read from and write to a ComponentBag.
 * They run in stratum order (lower = earlier). No fixed-point, no cycles.
 * Full Datalog fixed-point deferred to Phase 19.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent } from './IREvent'
import { parseStrudel } from './parseStrudel'
import { collect } from './collect'

// ---------------------------------------------------------------------------
// Component bag
// ---------------------------------------------------------------------------

export interface ComponentBag {
  strudelCode?: string
  sonicPiCode?: string   // Future — not populated in Phase F
  patternIR?: PatternIR
  irEvents?: IREvent[]
}

// ---------------------------------------------------------------------------
// System interface
// ---------------------------------------------------------------------------

export interface System {
  name: string
  /** Execution order. Lower stratum runs first. Within a stratum, order is deterministic. */
  stratum: number
  inputs: (keyof ComponentBag)[]
  outputs: (keyof ComponentBag)[]
  run(bag: ComponentBag): ComponentBag
}

// ---------------------------------------------------------------------------
// Propagation engine
// ---------------------------------------------------------------------------

/**
 * Run all systems in stratum order against the component bag.
 * Each system reads from the bag and returns an updated bag.
 * Systems with missing inputs are skipped.
 */
export function propagate(bag: ComponentBag, systems: System[]): ComponentBag {
  // Sort by stratum (stable sort preserves insertion order within a stratum)
  const sorted = [...systems].sort((a, b) => a.stratum - b.stratum)

  let current = bag
  for (const system of sorted) {
    // Skip if any required input is missing
    const hasAllInputs = system.inputs.every(
      key => current[key] !== undefined && current[key] !== null
    )
    if (!hasAllInputs) continue

    current = system.run(current)
  }

  return current
}

// ---------------------------------------------------------------------------
// Built-in systems for Phase F
// ---------------------------------------------------------------------------

export const StrudelParseSystem: System = {
  name: 'StrudelParseSystem',
  stratum: 1,
  inputs: ['strudelCode'],
  outputs: ['patternIR'],
  run(bag: ComponentBag): ComponentBag {
    if (!bag.strudelCode) return bag
    return { ...bag, patternIR: parseStrudel(bag.strudelCode) }
  },
}

export const IREventCollectSystem: System = {
  name: 'IREventCollectSystem',
  stratum: 2,
  inputs: ['patternIR'],
  outputs: ['irEvents'],
  run(bag: ComponentBag): ComponentBag {
    if (!bag.patternIR) return bag
    return { ...bag, irEvents: collect(bag.patternIR) }
  },
}
