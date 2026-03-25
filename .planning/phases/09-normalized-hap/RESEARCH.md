---
phase: 9
confidence: HIGH
researcher: anvi-researcher
created: 2026-03-25T00:00:00Z
---

# Phase 9 Research: Normalized Hap Type

## User Constraints
None in CONTEXT.md for this phase. Project invariants from `.anvi/` apply.

## Boundary Analysis

### Boundary 1: Raw Strudel Hap Shape (Queryable Path)
**What sketches actually read from raw Strudel haps** (verified by reading each sketch):

| Field | PianorollSketch | SpiralSketch | PitchwheelSketch | WordfallSketch |
|-------|:-:|:-:|:-:|:-:|
| `hap.whole.begin` | Y | Y | Y | Y |
| `hap.whole.end` | Y | Y | Y | Y |
| `hap.endClipped` | Y | Y | Y | Y |
| `hap.value.note` | Y | - | Y | Y |
| `hap.value.n` | Y | - | Y | Y |
| `hap.value.s` | Y | Y | - | Y |
| `hap.value.freq` | Y | - | Y | Y |
| `hap.value.gain` | Y | - | Y | - |
| `hap.value.velocity` | Y | - | Y | - |
| `hap.value.color` | Y | Y | Y | Y |
| `hap.part.begin` | - | - | - | - |
| `hap.part.end` | - | - | - | - |

Confidence: HIGH. Source: direct code reading of all 4 sketch files.

**Key observation:** `hap.part` is never used by any sketch. Only `hap.whole` and `hap.endClipped` matter for timing. The `hap.value` bag is the main data source.

### Boundary 2: HapEvent (Streaming Path)
**Current HapEvent fields and their consumers** (verified):

| Field | useHighlighting | Notes |
|-------|:-:|---|
| `hap` (raw) | No | NOT consumed by any subscriber. Legacy baggage. |
| `audioTime` | No | Not directly used by highlighting |
| `audioDuration` | Yes | For clear-delay timing |
| `scheduledAheadMs` | Yes | For show-delay timing |
| `midiNote` | No | Not used by highlighting |
| `s` | No | Not used by highlighting |
| `color` | Yes | For decoration class |
| `loc` | Yes | Core data for highlighting |

Confidence: HIGH. Source: useHighlighting.ts is the only streaming consumer.

**Key observation:** The `hap: any` field on HapEvent is dead weight. No subscriber accesses it. Highlighting uses only 4 fields: `loc`, `scheduledAheadMs`, `audioDuration`, `color`.

### Boundary 3: Producers (Who Constructs What)
**StrudelEngine:** Calls `hapStream.emit(rawHap, time, cps, endTime, audioCtxCurrentTime)`. The `emit()` method extracts `midiNote`, `s`, `color`, `loc` from the raw hap internally.

**DemoEngine:** Constructs a fake Strudel-shaped hap `{ value: { note, s }, whole: {...}, part: {...}, context: { locations: [] } }` just to satisfy `emit()`. This is the coupling this phase eliminates.

**SonicPiEngine (adapter):** Constructs a minimal fake hap `{ value: { note: e.midiNote, s: e.s } }` to satisfy `emit()`. The upstream sonicPiWeb engine already has its own flat `HapEvent` (no `hap: any` field) and uses `emitEvent()`.

Confidence: HIGH. Source: all three producer files read directly.

### Boundary 4: sonicPiWeb's HapStream (Reference Implementation)
sonicPiWeb already has a clean `HapEvent` without the `hap: any` field and uses `emitEvent()` as the primary API. This is the target pattern.

Confidence: HIGH. Source: `/sonicPiWeb/src/engine/HapStream.ts` read directly.

## Technical Findings

### Finding 1: Complete Field Union for NormalizedHap (Queryable)
The queryable path needs a type that covers what all 4 sketches access. Extracted from code:

```typescript
interface NormalizedHap {
  // Timing (from hap.whole + hap.endClipped)
  begin: number        // hap.whole.begin — cycle position start
  end: number          // hap.whole.end — cycle position end
  endClipped: number   // hap.endClipped ?? end — for active detection

  // Pitch/identity (from hap.value)
  note: number | string | null  // hap.value.note ?? hap.value.n
  freq: number | null           // hap.value.freq
  s: string | null              // hap.value.s — instrument/sample name

  // Dynamics
  gain: number         // hap.value.gain ?? 1
  velocity: number     // hap.value.velocity ?? 1

  // Display
  color: string | null // hap.value.color

  // Source location (for highlighting — only needed on streaming path)
  // NOT on queryable path; sketches never use it
}
```
Confidence: HIGH. Verified: every field is traced to specific sketch usage.

### Finding 2: Streaming HapEvent Needs Minimal Changes
The current HapEvent is already mostly normalized. The only change needed:
1. Remove `hap: any` (dead field, no consumer)
2. Add `emitEvent(event: HapEvent)` method alongside legacy `emit()`

This matches sonicPiWeb's existing pattern exactly.

Confidence: HIGH.

### Finding 3: Two Distinct Types for Two Paths
The streaming path and queryable path serve different consumers with different needs:
- **Streaming (HapEvent):** Real-time events with audio timing. Consumer: highlighting. Needs `loc`, `scheduledAheadMs`, `audioDuration`, `color`.
- **Queryable (NormalizedHap):** Cycle-position events for drawing. Consumer: sketches. Needs `begin`, `end`, `note`, `s`, `gain`, `color`.

These should remain separate types. Forcing one type to serve both paths adds unused fields to each consumer.

Confidence: HIGH. This is a design recommendation based on observed access patterns.

### Finding 4: PatternScheduler.query() Return Type
Currently `query()` returns `any[]`. The normalization point should be HERE: `query()` returns `NormalizedHap[]`. This means:
- The mapping from raw Strudel haps happens inside the scheduler wrapper (StrudelEngine.getPatternScheduler and trackSchedulers)
- Sketches receive clean typed data
- Non-Strudel engines implement `query()` returning `NormalizedHap[]` directly

Confidence: HIGH. The scheduler wrapper already exists in StrudelEngine (lines 260-268, 431-437). Adding a `.map(normalize)` is trivial.

### Finding 5: P5VizRenderer Already Bridges Correctly
P5VizRenderer passes `schedulerRef` to sketches. The ref points to whatever PatternScheduler the engine provides. If `query()` returns normalized haps, sketches automatically get normalized data. No P5VizRenderer changes needed.

Confidence: HIGH. Source: P5VizRenderer.ts line 33, mount() method.

### Finding 6: getValue() Logic Duplicated Across Sketches
PianorollSketch and WordfallSketch each have their own `getValue(hap)` function that resolves pitch from `note/n/freq/s`. PitchwheelSketch has `getFreq(hap)`. If we normalize `note` and `freq` fields, these functions simplify dramatically but are NOT eliminated (they do display-specific logic like fold-layout grouping).

Confidence: HIGH. Source: code reading.

## Invariants

### Existing (from `.anvi/vyapti.md`):
- **PV1**: Strudel Pattern methods return new instances (relevant: normalization must handle the output, not modify the Pattern)
- **UV6**: Observation without mutation (relevant: normalization is a read-only map, not a mutation of the hap)

### New Invariant for This Phase:
- **PV6 (proposed): Normalized Hap is a Value Object**: Wherever a NormalizedHap is created, it is a plain frozen/readonly object with no methods, no prototype chain, no framework references. Engines map INTO this shape; consumers read FROM it. The type is the contract boundary between engine and viz.

## Risks & Mitigations

### Risk 1: Strudel hap.whole.begin/end are Fraction objects, not numbers
Strudel uses a Fraction type internally. All sketches wrap access in `Number(hap.whole?.begin ?? 0)`. The normalization layer must do this coercion.
**Mitigation:** The normalize function calls `Number()` on begin/end. Verified: all 4 sketches already do this.

### Risk 2: endClipped may not exist
`hap.endClipped` is present on clipped haps but absent on unclipped ones. All sketches fall back: `hap.endClipped ?? hap.whole?.end`.
**Mitigation:** Normalize function computes `endClipped: Number(hap.endClipped ?? hap.whole?.end ?? begin + 0.25)`.

### Risk 3: Breaking external code that accesses HapEvent.hap
Any code outside the project that subscribes to HapStream and reads `event.hap` would break.
**Mitigation:** LOW risk. HapStream is an internal class, not exported from the package. The only subscriber is useHighlighting, which does not access `event.hap`. Keep the field as `hap?: any` (optional) for one phase, then remove.

### Risk 4: Performance of normalize() on every query() call
Sketches call `query()` every frame (60fps). Each call returns 10-100+ haps. A `.map(normalize)` adds allocation per frame.
**Mitigation:** The normalize function is trivial field extraction (~10 property reads + Number coercions). This is negligible compared to the p5 drawing cost. If profiling shows issues later, cache normalized results per cycle range.

## Recommended Approach

### 1. Define `NormalizedHap` type
In a new file `packages/editor/src/engine/NormalizedHap.ts`:
```typescript
export interface NormalizedHap {
  begin: number
  end: number
  endClipped: number
  note: number | string | null
  freq: number | null
  s: string | null
  gain: number
  velocity: number
  color: string | null
}
```

### 2. Add `normalizeStrudelHap(hap: any): NormalizedHap` function
Same file. Extracts and coerces all fields from raw Strudel hap shape. Single source of truth for the mapping.

### 3. Update PatternScheduler interface
Change `query()` return type from `any[]` to `NormalizedHap[]`.

### 4. Update StrudelEngine scheduler wrappers
In `getPatternScheduler()` and track scheduler construction: wrap `queryArc()` results with `.map(normalizeStrudelHap)`.

### 5. Update all 4 sketches
Replace `hap.whole.begin` with `hap.begin`, `hap.value.color` with `hap.color`, etc. Remove internal `getValue()` functions where normalization handles it (keep display-specific logic).

### 6. Update HapEvent (streaming path)
- Remove `hap: any` (or make optional)
- Add `emitEvent(event: HapEvent)` to HapStream (matches sonicPiWeb)
- Keep legacy `emit()` for backward compat, have it call `emitEvent()` internally

### 7. Update DemoEngine and SonicPiEngine adapter
- DemoEngine: call `emitEvent()` directly instead of constructing fake hap
- SonicPiEngine adapter: call `emitEvent()` directly, forwarding sonicPiWeb events without fake hap wrapper

### Order of operations
Steps 1-2 first (pure additions, no breakage). Then 3-4 (changes scheduler contract). Then 5 (sketch migration). Then 6-7 (streaming path cleanup). Each step is independently testable.
