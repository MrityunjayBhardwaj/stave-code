# Stave Studio — Complete Design Document

**Last updated:** 2026-04-08
**Source:** Session discussions on bidirectional editing, topology, audio regions, IR completeness, kernel/wavelet representation, practical DAW UX, and vocal workflows.

---

## 1. What Stave Studio Is

staveCoder + bidirectional DAW + visual patcher + audio input. No code required for any workflow.

**The thesis in one sentence:** A musical pattern is a mathematical object. Code, DAW timeline, node graph, sheet music, and audio are all projections of the same Pattern IR — switching between them is instant, lossless, and bidirectional.

---

## 2. The Pattern IR — Current State and Completeness

### What's built (Phase F)

15-node free monad ADT: Pure, Seq, Stack, Play, Sleep, Choice, Every, Cycle, When, FX, Ramp, Fast, Slow, Loop, Code. Plus parsers (parseMini, parseStrudel), interpreters (collect → IREvent[], toStrudel → code), JSON serialization, ECS propagation engine. 110+ tests. Wired into StrudelEngine.

### Coverage (from Theorem 5.13 — Stratified Isomorphism)

| Stratum | What | Coverage | Bidirectional? |
|---------|------|----------|---------------|
| **S1** — stateless cyclic | note/play/sleep/stack/fast/slow/every/fx | **~80%** of real patterns | Full (constructive bijection) |
| **S2** — seeded stochastic | rand, sometimesBy, choose (with seed) | **~15%** more | Full (bijection indexed by seed) |
| **S3** — state-accumulating | counter, tick/look, cross-cycle state | **~5%** remaining | Impossible (proven: fast(k) can't commute with state accumulation) |

**95% bidirectional coverage.** The 5% boundary is mathematical, not an implementation gap.

### What's NOT in the IR (dialect extensions, not core gaps)

**Strudel-specific:** continuous signals (sine, perlin), jux, rev, euclidean, chop, striate, pattern-of-patterns, arbitrary JS lambdas.

**Sonic Pi-specific:** in_thread, with_fx (block-scoped), cue/sync, tick/look, live_audio.

**DAW-specific:** automation lanes, audio regions, send/return routing, plugin chains, tempo maps.

### The Architecture Decision: MLIR Dialect Model

```
                ┌── Strudel dialect (continuous signals, jux, rev, euclidean)
                │
Core IR (15) ───┼── Sonic Pi dialect (in_thread, with_fx, cue/sync)
                │
                └── DAW dialect (AudioRegion, AutomationLane, routing)
```

Core nodes translate freely across projections. Dialect nodes either **lower** to core approximations or become `Code` nodes when crossing boundaries. The `Code` node is the escape hatch — not failure, but a viewport boundary.

---

## 3. The Three-Layer Representation

```
Layer 1: Free monad IR     → structural editing (drag notes, rewrite code)
Layer 2: IREvent[]         → visualization (pianoroll, timeline, DAW view)
Layer 3: Kernel/wavelet    → semantic analysis (similarity, interpolation, generation)
```

### Why not just kernels/wavelets?

Kernels achieve ~100% coverage of the SIGNAL but 0% of the SYNTAX. Bidirectional editing requires knowing HOW the user wrote the pattern, not just WHAT it sounds like. The inverse problem (signal → code) is massively underdetermined — infinite programs produce the same signal.

### What kernels/wavelets ADD (Layer 3, Phase 22-23)

| Capability | How |
|-----------|-----|
| "Find patterns that sound like this" | Kernel similarity in signal space |
| Audio → IR (the closed loop) | Inverse synthesis via DDSP-style transforms |
| Interpolation between patterns | RKHS interpolation |
| Style transfer | Kernel decomposition |
| Generative | Sample from kernel space |

Layer 3 sits BELOW the IR, not in place of it. The complete system: Code ↔ IR ↔ IREvent[] → Signal/Kernel → Audio.

---

## 4. Poly Framework — The Mathematical Foundation

From THESIS_COMPLETE.md Chapter 5. Every pattern transform is a **Poly morphism** — a bidirectional lens:

```
φ_fwd:   positions → positions          (evaluation)
φ_bwd:   directions → directions        (provenance / editing)
```

Composition of morphisms automatically gives provenance chains (Theorem 5.8).

### Views as Poly Morphisms

```
view_code:  IR ↔ source code              (parse / toStrudel)
view_daw:   IR ↔ timeline events           (collect / code synthesis)
view_viz:   IR ↔ visual scene              (render / parameter mapping)
view_graph: IR ↔ node graph                (structural isomorphism)
```

All four views are morphisms in the same category. Bidirectionality is native.

### Topology of Code Space (Chapter 6)

```
E = { all possible event sets }            — high-dimensional space
C ⊂ E = { event sets expressible by code } — structured subspace
```

| Region | User action | System response |
|--------|------------|-----------------|
| **Smooth (Tier 1)** | Move note in simple sequence | Code auto-updates. `"c4 e4 g4"` → `"c4 g4 e4"` |
| **Smooth (Tier 2)** | Change pitch or gain | Parameter updates. `"e4"` → `"f4"` |
| **Fold (Tier 3)** | Edit a fast(2) copy | Popup: "Edit source (affects both copies) or split?" |
| **Singularity (Tier 4)** | Edit an every(4,rev) output | Warning: "Requires restructuring. [Option A] [Option B]" |

**80% of edits are Tier 1-2** — automatic, no dialogs.

---

## 5. The DAW — Practical Design

### 80% DAW Use Case (5 operations)

```
1. Draw notes    — click grid → insert Play node → code updates
2. Move notes    — drag time/pitch → reorder Seq / change param → code updates
3. Resize notes  — drag edge → change duration → code updates
4. Delete notes  — select+delete → remove Play node → code updates
5. Adjust velocity — drag bar → change gain → code updates
```

### Implementation Architecture

**Piece 1: Provenance on IR nodes**
```typescript
interface IRNodeMeta {
  id: string                                    // unique for tracing
  sourceSpan?: { start: number; end: number }   // char range in source
}
```

**Piece 2: Backward maps (Poly morphisms)**
```typescript
interface Edit {
  nodeId: string
  field: 'note' | 'begin' | 'gain' | 'duration' | ...
  oldValue: unknown
  newValue: unknown
}

// fast(2).backward: time edits multiply back by k
// stack().backward: route edit to correct child
// rev().backward: mirror time coordinates
```

**Piece 3: DawVizRenderer** — Canvas-based renderer reading IREvents, with mouse interaction for drag/draw/resize/delete.

**Piece 4: BidirectionalBinding** — DAW edit → backward map chain → IR update → toStrudel → Monaco editor update → re-evaluate.

### End-to-End Flow

```
1. User writes:     $: note("c4 e4 g4").fast(2).viz("daw")
2. parseStrudel:    Fast(2, Seq([Play(c4,id:n0), Play(e4,id:n1), Play(g4,id:n2)]))
3. collect:         6 IREvents (fast(2) doubles) with meta.id provenance
4. DAW renders:     [C4][E4][G4][C4][E4][G4]
5. User drags E4 → beat 0.4
6. Edit emitted:    { nodeId:"n1", field:"begin", newValue:0.4 }
7. Backward map:    fast(2).backward → 0.4 * 2 = 0.8 (undo time compression)
8. Apply to IR:     reorder in Seq
9. toStrudel:       note("c4 g4 e4").fast(2)
10. Editor updates, audio re-evaluates
```

---

## 6. Samples and Audio Regions

### Three layers of sample use

| Layer | What | Status |
|-------|------|--------|
| **Trigger** | `s("bd")` at beat 1 | Works today — IR Play node |
| **Select** | `s("bd:3")` variant | Works today |
| **Manipulate** | Chop, slice, waveform editing | Needs AudioRegion IR node |
| **Record** | Mic → buffer → waveform | Needs AudioInput component |

### AudioRegion IR Node (new, for DAW dialect)

```typescript
interface AudioRegionNode {
  tag: 'AudioRegion'
  source: string              // sample name or URL
  begin: number               // start in source (0..1)
  end: number                 // end in source (0..1)
  speed: number               // playback speed (pitch)
  stretch: number             // time-stretch without pitch
  meta: IRNodeMeta
}
```

Chop+slice becomes `Seq([AudioRegion("break", 3/16, 4/16), ...])`. Dragging slices = reordering Seq children. Same backward map as notes.

### Waveform display

New engine component:
```typescript
interface AudioBufferComponent {
  buffers: Map<string, AudioBuffer>   // sample name → decoded buffer
}
```

DawVizRenderer draws waveform shapes from AudioBuffer data alongside note blocks.

---

## 7. Vocals

### Workflow stages

**Stage 1: Record** — AudioInput component (MediaStream → MediaRecorder → AudioBuffer takes)

**Stage 2: Display** — Waveform renderer in DAW view, phrase boundaries detected by onset detection

**Stage 3: Edit** — Drag phrases (reorder AudioRegion nodes), pitch correct (AudioRegion.speed), time align (AudioRegion.stretch), comp takes (swap AudioRegion.source)

### In code

```js
$: s("vocal_take3")
  .slice(0, [0, 1, 2])           // use phrases 0, 1, 2 from take 3
  .speed("1.02 1.0 0.98")        // pitch corrections per phrase
  .room(0.3).delay(0.2)
```

Edit pitch in DAW → `.speed()` updates → code regenerates.

### The closed loop (Phase 22)

Audio in → pitch detection + onset detection → IREvents → DAW view → user edits → IR updates → code regenerates. Vocalist sings, sees notes appear, edits them structurally.

---

## 8. Build Sequence — Updated

### staveCoder (ship first)

```
Phase F  (done)  → Pattern IR foundation
Phase 10 (80%)   → Monaco intelligence (10-03: tokenizer remaining)
Phase 11 (todo)  → Library polish + npm publish @stave/editor
```

### Stave Studio (after staveCoder ships)

```
Phase 12  → Synth invariance (SynthBackend interface)
Phase 13  → External sync (Link, MIDI, OSC)
Phase 14  → Recording + export (WAV, stems)
Phase 15  → Provenance (session log, signing, metadata)
Phase 16  → Collaboration (Yjs CRDT, cursor presence)
Phase 17  → UI bento box (sliders, knobs, MIDI CC)
Phase 18  → Composr integration

Phase 19  → Pattern IR full: bidirectional DAW
            - IRNodeMeta (provenance on nodes)
            - Backward maps for core transforms
            - DawVizRenderer (interactive timeline)
            - BidirectionalBinding (edit → backward map → toStrudel → editor)
            - Code synthesis tiers (T1-T4)
            - AudioRegion node (samples + vocals)

Phase 20  → Transform graph (React Flow node patcher)
            - Visual representation of free monad
            - Bypass/solo toggles
            - Bidirectional: edit nodes → IR → code updates

Phase 21  → Indian classical (tala circle, bol notation, tihai verification)
Phase 22  → Audio analysis (audio → IR, the closed loop)
            - AudioInput component (recording)
            - Onset detection, pitch tracking
            - Audio → IREvents → DAW view
            - Vocal workflow (record → display → edit)
            - AudioRegion manipulation (chop, slice, stretch)

Phase 23  → Transparent AI (normalizing flow synth, attribution)
            - Layer 3: kernel/wavelet signal representation
            - Similarity, interpolation, generation
            - Training data attribution
```

---

## 9. Key Theorems (from THESIS_COMPLETE.md)

| Theorem | What it means practically |
|---------|-------------------------|
| **5.8** (Provenance compositionality) | Click any event → see full derivation chain through all transforms. Automatic. |
| **5.13** (Stratified isomorphism) | 95% of patterns are fully bidirectional. The 5% that aren't is proven impossible. |
| **6.1** (Continuity of Tier 1 synthesis) | Simple note moves in DAW → code updates with Lipschitz constant 1. No surprises. |
| **7.1** (Poly subsumes Mazzola) | Every music theory analysis tool works as a read-only IR view. Bidirectional editing is the upgrade. |

---

## 10. Open Questions

1. **AudioRegion + backward maps:** What does "drag a waveform slice earlier" mean as a backward map through the transform chain? The time-domain edit is clear, but the code synthesis for `s("break").chop(16).slice(...)` is non-trivial.

2. **Vocal pitch correction granularity:** Per-note? Per-phoneme? Per-sample? The IR resolution determines the editing granularity.

3. **Layer 3 integration:** When kernel/wavelet analysis produces an IR (audio → events), how confident is the mapping? Need a confidence/uncertainty signal in the UI.

4. **Arrangement (scenes):** A scene = collection of patterns. How does scene-level editing interact with pattern-level IR? Is a scene just a `Stack` of patterns, or does it need its own IR node?

5. **Per-track audio routing:** Currently one global AnalyserNode. Per-track audio analysis needs per-orbit gain routing in Strudel (or the HapEnergyEnvelope workaround we built this session).
