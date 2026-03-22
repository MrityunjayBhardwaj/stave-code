# Phase 6: Inline Zones via Abstraction - Research

**Researched:** 2026-03-22
**Domain:** Monaco view zones, VizRenderer lifecycle, per-track scheduler wiring
**Confidence:** HIGH — all findings from direct source inspection of the codebase; no external research required

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ZONE-01 | addInlineViewZones accepts VizRendererSource parameter (factory or instance) | VizRendererSource type already defined in types.ts; mountVizRenderer already accepts it; viewZones.ts currently hardcodes `() => new P5VizRenderer(PianorollSketch)` inline instead of accepting as param |
| ZONE-02 | Each inline zone resolves track-scoped VizRefs before mount — scheduler from getTrackSchedulers() | StrudelEngine.getTrackSchedulers() returns Map<string, PatternScheduler>; track keys are "$0", "$1" for anon $: lines; viewZones.ts must receive the engine (or the map) and resolve before changeViewZones callback |
| ZONE-03 | Zone div width from editor.getLayoutInfo().contentWidth (not container.clientWidth which is 0 pre-attach) | Monaco EditorLayoutInfo.contentWidth confirmed in monaco-editor@0.50.0 type definitions; container.clientWidth is 0 before the zone DOM node is attached to the editor scroll container |
| ZONE-04 | addInlineViewZones returns { cleanup, pause, resume } — StrudelEditor calls pause on stop, resume on play | StrudelEditor currently stores `viewZoneCleanupRef.current` as `(() => void) | null`; needs to change to `{ cleanup: () => void; pause: () => void; resume: () => void } | null` |
</phase_requirements>

---

## Summary

Phase 6 is a targeted refactor of `viewZones.ts` and the `StrudelEditor.tsx` call site. The current implementation hardcodes `PianorollSketch` as the only inline renderer and exposes only a cleanup function. Phase 6 generalises this: any `VizRendererSource` can be passed in, each zone receives a per-track `PatternScheduler` resolved from `getTrackSchedulers()`, the initial canvas width is taken from `editor.getLayoutInfo().contentWidth` (the zone container has `clientWidth === 0` before attachment), and the return value expands from `() => void` to `{ cleanup, pause, resume }` so `StrudelEditor` can pause inline renderers on stop and resume them on play without destroying and recreating zones.

All necessary abstractions (`VizRendererSource`, `mountVizRenderer`, `getTrackSchedulers`) are already in place from Phases 4 and 5. This phase is purely a wiring refactor — no new interfaces, no new engine logic, no new dependencies.

**Primary recommendation:** Change the signature of `addInlineViewZones`, pipe `getTrackSchedulers()` to build per-track `schedulerRef` values, use `editor.getLayoutInfo().contentWidth` for initial width, store renderer instances so pause/resume can be forwarded, and update `StrudelEditor` to call `pause`/`resume` at the right lifecycle points.

---

## Current State (What Exists Today)

### viewZones.ts — Current Signature

```typescript
// packages/editor/src/visualizers/viewZones.ts

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null
): () => void
```

Problems relative to Phase 6 goals:
1. `VizRendererSource` is not a parameter — hardcoded to `() => new P5VizRenderer(PianorollSketch)`
2. `schedulerRef` is always `{ current: null }` — never populated per-track
3. Initial size uses `container.clientWidth || 400` — clientWidth is 0 before DOM attach
4. Returns `() => void` — no pause/resume surface

### StrudelEditor.tsx — Current Call Site

```typescript
// Line 107
const viewZoneCleanupRef = useRef<(() => void) | null>(null)

// In handlePlay (line 176–183):
if (_inlinePianoroll && editorRef.current) {
  viewZoneCleanupRef.current?.()
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    engine.getHapStream(),
    engine.getAnalyser()
  )
}

// In handleStop (line 202–204):
viewZoneCleanupRef.current?.()
viewZoneCleanupRef.current = null
```

Problems:
- `viewZoneCleanupRef` typed as `() => void` — must expand to `{ cleanup, pause, resume }`
- Stop calls cleanup (destroys zones) — after Phase 6, stop should call `pause`, not `cleanup`
- `getTrackSchedulers()` is never called from viewZones.ts

---

## Architecture Patterns

### Pattern 1: New addInlineViewZones Signature

```typescript
// Source: direct design from types.ts + viewZones.ts analysis

export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  source: VizRendererSource,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>
): InlineZoneHandle
```

The function keeps `hapStream` and `analyser` as pass-through (they are shared across all tracks). `trackSchedulers` is the new parameter that enables per-track `schedulerRef` values.

### Pattern 2: Track Key Resolution

The `trackSchedulers` map uses keys `"$0"`, `"$1"` for anonymous `$:` patterns and literal names for named patterns. The view zone loop must match the same sequential index that `getTrackSchedulers()` assigns.

The current loop iterates `lines.forEach((line, i) => ...)` and counts how many `$:` lines have been seen. The same counter must map to `"$0"`, `"$1"`, etc.

```typescript
// Correct key derivation inside changeViewZones callback
let anonIndex = 0
lines.forEach((line, i) => {
  if (!line.trim().startsWith('$:')) return
  const key = `$${anonIndex}`
  anonIndex++
  const trackScheduler = trackSchedulers.get(key) ?? null
  const schedulerRef = { current: trackScheduler } as RefObject<PatternScheduler | null>
  // ...
})
```

**Critical:** Named patterns (e.g. `d1:`) use their literal name as key. The line must be parsed to extract the name if named patterns are to be matched. However, the Phase 6 success criteria only requires per-track scheduler wiring — not named-pattern matching. The simplest correct approach is: parse the line prefix to detect `name:` vs `$:` and use the appropriate key.

Safer fallback: use `"$0"`, `"$1"` only. Named `d1:` lines would get `null` scheduler, which is acceptable for Phase 6 since they fall back to the shared PatternScheduler gracefully (sketches already handle `schedulerRef.current === null`).

### Pattern 3: contentWidth for Initial Size

```typescript
// Instead of:
{ w: container.clientWidth || 400, h: VIEW_ZONE_HEIGHT }

// Use:
{ w: editor.getLayoutInfo().contentWidth || 400, h: VIEW_ZONE_HEIGHT }
```

`editor.getLayoutInfo().contentWidth` is the width of the text content area (excludes glyph margin, line numbers, decorations, scrollbar). This is available synchronously at the time `changeViewZones` fires — the editor is already laid out. The zone container div is not in the DOM yet at this point, so `clientWidth` is 0.

The `ResizeObserver` inside `mountVizRenderer` will correct the canvas size once the DOM node is actually attached. The initial size just needs to be non-zero to avoid a blank canvas on first paint.

### Pattern 4: pause/resume Return Value

```typescript
// Collect renderer instances during zone creation
const renderers: VizRenderer[] = []
const disconnects: (() => void)[] = []
const zoneIds: string[] = []

editor.changeViewZones((accessor) => {
  // ... for each $: line:
  const { renderer, disconnect } = mountVizRenderer(...)
  renderers.push(renderer)
  disconnects.push(disconnect)
  zoneIds.push(zoneId)
})

return {
  cleanup() {
    disconnects.forEach(fn => fn())
    renderers.forEach(r => r.destroy())
    editor.changeViewZones((accessor) => {
      zoneIds.forEach(id => accessor.removeZone(id))
    })
  },
  pause() {
    renderers.forEach(r => r.pause())
  },
  resume() {
    renderers.forEach(r => r.resume())
  },
}
```

### Pattern 5: StrudelEditor Lifecycle Wiring

```typescript
// viewZoneCleanupRef typed change:
const viewZoneCleanupRef = useRef<InlineZoneHandle | null>(null)

// handlePlay — after evaluate() succeeds:
if (_inlinePianoroll && editorRef.current) {
  viewZoneCleanupRef.current?.cleanup()  // destroy previous zones
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    () => new P5VizRenderer(PianorollSketch),  // default source
    engine.getHapStream(),
    engine.getAnalyser(),
    engine.getTrackSchedulers()
  )
  viewZoneCleanupRef.current.resume()  // ensure renderers are running
}

// handleStop — pause zones, don't destroy:
viewZoneCleanupRef.current?.pause()
// Do NOT set viewZoneCleanupRef.current = null here
```

**Caution on stop behavior:** The current handleStop calls `viewZoneCleanupRef.current?.()` which destroys everything. After Phase 6, stop should call `pause()` to freeze the animation, keeping the zones visible but static. When play resumes (next evaluate), zones are destroyed and recreated fresh. This avoids stale canvas state from a previous pattern evaluation.

Alternative: `pause()` on stop, `cleanup()` only before a new evaluate. This is the cleaner approach — zones stay visible (showing last frame) when stopped, disappear on re-evaluate.

### Anti-Patterns to Avoid

- **Do NOT call `cleanup()` on stop** — this destroys the p5 canvas and removes the zone from the editor. Users expect the pianoroll to stay visible (frozen at last frame) when stopped.
- **Do NOT use `container.clientWidth`** for initial size — it is 0 when the zone container is created (before DOM attachment). Always use `editor.getLayoutInfo().contentWidth`.
- **Do NOT share a single `VizRenderer` instance** across multiple zones — `VizDescriptor.factory` returns a new instance per call precisely to avoid this. Each zone needs its own renderer.
- **Do NOT make `destroy()` async** — `StrudelEditor` calls cleanup synchronously before re-adding zones.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mounting renderer in zone | Custom canvas setup | `mountVizRenderer()` | Already handles factory resolution, ResizeObserver, and mount call |
| Renderer lifecycle | Custom pause/loop toggle | `renderer.pause()` / `renderer.resume()` | P5VizRenderer already delegates to `noLoop()` / `loop()` |
| Width measurement | DOM introspection | `editor.getLayoutInfo().contentWidth` | The only reliable source when zone container is off-DOM |

---

## Common Pitfalls

### Pitfall 1: container.clientWidth is 0 inside changeViewZones
**What goes wrong:** `mountVizRenderer` receives `{ w: 0, h: 120 }`. p5 creates a 0-wide canvas. ResizeObserver fires later and corrects it, but the first frame renders to a zero-size canvas, sometimes causing p5 to not initialize properly.
**Why it happens:** The `domNode` passed to `addZone` is a detached div. Monaco attaches it to the scroll container after `changeViewZones` returns.
**How to avoid:** Use `editor.getLayoutInfo().contentWidth` at the time of the `changeViewZones` call — the editor is laid out, this returns the correct pixel width synchronously.
**Warning signs:** Canvas appears blank for 1-2 frames after zone is added; p5 `setup()` reports `width === 0`.

### Pitfall 2: Destroy on stop breaks zone visibility
**What goes wrong:** If `cleanup()` is called on stop (current behavior), the zone DOM node is removed and the canvas disappears. When the user presses play again, zones are re-created — causing a visual flash.
**Why it happens:** `cleanup()` calls `accessor.removeZone(id)` inside `editor.changeViewZones`, which immediately removes the zone from the DOM.
**How to avoid:** On stop, call `pause()` (freezes animation loop) not `cleanup()`. Call `cleanup()` only at the start of the next evaluate() before re-adding zones.
**Warning signs:** Inline pianoroll disappears immediately when stop is pressed.

### Pitfall 3: Track key mismatch with getTrackSchedulers
**What goes wrong:** Zone for line N gets the wrong scheduler (or null) because the key counter is off.
**Why it happens:** `anonIndex` in viewZones.ts increments for every `$:` line. `anonIndex` in StrudelEngine.ts increments the same way during pattern capture. They must stay in sync.
**How to avoid:** Use the same sequential counter. Named patterns (`d1:`, `bass:`) use their literal name as key — if you only handle anonymous `$:` keys, named-pattern zones get `null` scheduler (acceptable fallback).
**Warning signs:** Inline pianoroll for track 2 shows data from track 1; or all inline pianorolls show identical data.

### Pitfall 4: InlineZoneHandle type not exported
**What goes wrong:** `StrudelEditor.tsx` cannot type `viewZoneCleanupRef` correctly without importing the return type.
**How to avoid:** Export `InlineZoneHandle` from `viewZones.ts` alongside `addInlineViewZones`. Or define it inline in types.ts.

### Pitfall 5: Multiple p5 instances from shared VizRendererSource instance
**What goes wrong:** If caller passes a `VizRenderer` instance (not a factory) as `VizRendererSource`, `mountVizRenderer` will call `mount()` on the same instance multiple times — each `$:` zone calls `mount()` on the same object.
**Why it happens:** `VizRendererSource = (() => VizRenderer) | VizRenderer`. If a raw instance is passed, `mountVizRenderer` uses it directly for all zones.
**How to avoid:** For inline zones, always use a factory (`() => new P5VizRenderer(PianorollSketch)`). Document this in the function's JSDoc. The default should be `() => new P5VizRenderer(PianorollSketch)`.

---

## Code Examples

### Full Refactored viewZones.ts

```typescript
// Source: analysis of current viewZones.ts + types.ts + mountVizRenderer.ts

import type * as Monaco from 'monaco-editor'
import type { RefObject } from 'react'
import type { HapStream } from '../engine/HapStream'
import type { VizRefs, PatternScheduler, VizRendererSource, VizRenderer } from './types'
import { mountVizRenderer } from './mountVizRenderer'

const VIEW_ZONE_HEIGHT = 120

export interface InlineZoneHandle {
  cleanup(): void
  pause(): void
  resume(): void
}

export function addInlineViewZones(
  editor: Monaco.editor.IStandaloneCodeEditor,
  source: VizRendererSource,
  hapStream: HapStream | null,
  analyser: AnalyserNode | null,
  trackSchedulers: Map<string, PatternScheduler>
): InlineZoneHandle {
  const model = editor.getModel()
  if (!model) {
    return { cleanup: () => {}, pause: () => {}, resume: () => {} }
  }

  const code = model.getValue()
  const lines = code.split('\n')
  const zoneIds: string[] = []
  const renderers: VizRenderer[] = []
  const disconnects: (() => void)[] = []

  // contentWidth is available synchronously; container.clientWidth is 0 (not yet in DOM)
  const contentWidth = editor.getLayoutInfo().contentWidth

  const hapStreamRef = { current: hapStream } as RefObject<HapStream | null>
  const analyserRef  = { current: analyser }  as RefObject<AnalyserNode | null>

  let anonIndex = 0

  editor.changeViewZones((accessor) => {
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('$:')) return

      const key = `$${anonIndex}`
      anonIndex++
      const trackScheduler = trackSchedulers.get(key) ?? null
      const schedulerRef = { current: trackScheduler } as RefObject<PatternScheduler | null>

      const container = document.createElement('div')
      container.style.cssText = 'overflow:hidden;height:120px;'

      const zoneId = accessor.addZone({
        afterLineNumber: i + 1,
        heightInPx: VIEW_ZONE_HEIGHT,
        domNode: container,
        suppressMouseDown: true,
      })
      zoneIds.push(zoneId)

      const refs: VizRefs = { hapStreamRef, analyserRef, schedulerRef }
      const { renderer, disconnect } = mountVizRenderer(
        container,
        source,
        refs,
        { w: contentWidth || 400, h: VIEW_ZONE_HEIGHT },
        console.error
      )
      renderers.push(renderer)
      disconnects.push(disconnect)
    })
  })

  return {
    cleanup() {
      disconnects.forEach(fn => fn())
      renderers.forEach(r => r.destroy())
      editor.changeViewZones((accessor) => {
        zoneIds.forEach(id => accessor.removeZone(id))
      })
    },
    pause() {
      renderers.forEach(r => r.pause())
    },
    resume() {
      renderers.forEach(r => r.resume())
    },
  }
}
```

### StrudelEditor.tsx Changes

```typescript
// Import InlineZoneHandle
import { addInlineViewZones, type InlineZoneHandle } from './visualizers/viewZones'

// Change ref type:
const viewZoneCleanupRef = useRef<InlineZoneHandle | null>(null)

// In handlePlay after evaluate() succeeds:
if (_inlinePianoroll && editorRef.current) {
  viewZoneCleanupRef.current?.cleanup()
  viewZoneCleanupRef.current = addInlineViewZones(
    editorRef.current,
    () => new P5VizRenderer(PianorollSketch),
    engine.getHapStream(),
    engine.getAnalyser(),
    engine.getTrackSchedulers()
  )
}

// In handleStop:
viewZoneCleanupRef.current?.pause()
// (do NOT set to null — zones remain visible, frozen)
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `packages/editor/vitest.config.ts` |
| Quick run command | `pnpm --filter @strucode/editor test --run` |
| Full suite command | `pnpm --filter @strucode/editor test --run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ZONE-01 | addInlineViewZones accepts VizRendererSource, passes it to mountVizRenderer | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing `viewZones.test.ts` — needs updates |
| ZONE-02 | Each zone receives track-scoped schedulerRef populated from trackSchedulers map | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing test file — add new cases |
| ZONE-03 | Initial size uses contentWidth not clientWidth | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing test file — add assertion |
| ZONE-04 | Return value has { cleanup, pause, resume } methods; pause calls renderer.pause() | unit | `pnpm --filter @strucode/editor test --run viewZones` | existing test file — add assertions |

### Existing Tests That Must Still Pass

`viewZones.test.ts` has 7 tests covering current `() => void` return behavior. These tests must be migrated:
- "returns a cleanup function" → "returns an object with cleanup, pause, resume"
- "cleanup function calls editor.changeViewZones to remove zones" → same assertion via `handle.cleanup()`
- All existing zone-count and line-number assertions remain valid

### Wave 0 Gaps

None — existing test infrastructure is sufficient. `viewZones.test.ts` exists with appropriate mocks for `mountVizRenderer`, `p5`, and `PianorollSketch`. The mock for `mountVizRenderer` already returns `{ renderer: { mount, resize, pause, resume, destroy }, disconnect }` — the `pause` and `resume` methods are already mocked, enabling assertions on ZONE-04.

---

## Open Questions

1. **Named pattern key resolution**
   - What we know: `getTrackSchedulers()` keys named patterns (e.g., `d1:`) by their literal name, not `"$0"` etc.
   - What's unclear: Does Phase 6 need to handle named patterns? Success criteria says "scheduler from getTrackSchedulers()" without specifying named vs anonymous.
   - Recommendation: Implement anonymous `$:` key mapping (`"$0"`, `"$1"`) only in Phase 6. Named patterns get `null` scheduler — acceptable since sketches already handle `schedulerRef.current === null`. Named pattern support can be added in Phase 7+ if needed.

2. **Pause on stop vs. cleanup on stop**
   - What we know: Success criteria says "pause on stop, resume on play" (ZONE-04)
   - What's unclear: If zones are paused but not cleaned up, they persist after stop. When evaluate() runs again they are cleaned up and recreated. Is the visible frozen pianoroll between stop and next play the intended UX?
   - Recommendation: Yes — ZONE-04 explicitly says pause on stop. Frozen inline pianorolls after stop is the correct behavior per the requirements.

---

## Sources

### Primary (HIGH confidence)

- `packages/editor/src/visualizers/viewZones.ts` — current implementation, all 4 problems identified
- `packages/editor/src/visualizers/types.ts` — `VizRendererSource`, `VizRenderer`, `VizRefs`, `PatternScheduler` type definitions
- `packages/editor/src/visualizers/mountVizRenderer.ts` — shared mount utility, confirms it accepts `VizRendererSource` and returns `{ renderer, disconnect }`
- `packages/editor/src/StrudelEditor.tsx` — current viewZoneCleanupRef typing and call sites
- `packages/editor/src/engine/StrudelEngine.ts` — `getTrackSchedulers()` signature and key format (`"$0"`, `"$1"`)
- `packages/editor/src/__tests__/viewZones.test.ts` — 7 existing tests, mock structure confirmed
- `node_modules/.pnpm/monaco-editor@0.50.0/node_modules/monaco-editor/monaco.d.ts` — `EditorLayoutInfo.contentWidth` confirmed as `readonly number`, `IViewZone.onDomNodeTop` confirmed, `IStandaloneCodeEditor.getLayoutInfo()` confirmed

### Secondary (MEDIUM confidence)

- `memory/project_viz_renderer_plan.md` (Phase C section) — documents all gotchas: container.clientWidth=0, multiple p5 ok up to ~6 tracks, destroy must be synchronous, viewZoneCleanupRef needs { cleanup, pause, resume }

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all types and utilities from Phases 4 and 5 are already in place
- Architecture: HIGH — direct code inspection of all files; the refactor path is unambiguous
- Pitfalls: HIGH — pitfalls documented in project memory + confirmed against source

**Research date:** 2026-03-22
**Valid until:** Indefinite — this is entirely an internal refactor with no external dependencies
