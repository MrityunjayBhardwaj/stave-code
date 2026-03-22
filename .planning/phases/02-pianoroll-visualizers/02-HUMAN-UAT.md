---
status: partial
phase: 02-pianoroll-visualizers
source: [02-VERIFICATION.md]
started: 2026-03-22T00:00:00Z
updated: 2026-03-22T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pianoroll renders at 60fps (smooth animation)
expected: Canvas animates smoothly at 60fps with no visible stuttering when a pattern is playing
result: [pending]

### 2. Note colors and drum lane placement
expected: Drum sounds (bd, sd, hh) appear in the bottom 20% lane; pitched notes span MIDI 24–96 on Y-axis; note colors use hap.value.color or s-field category fallback
result: [pending]

### 3. Inline view zones appear in Monaco below $: lines
expected: A 120px pianoroll canvas appears below each `$:` line in the Monaco editor
result: [pending]

### 4. View zones re-appear after re-evaluate
expected: After editing code and triggering evaluate() again, inline pianorolls reattach below $: lines
result: [pending]

### 5. VizPicker mode switching
expected: Clicking each of the 5 VizPicker buttons changes the active sketch in VizPanel; active button has accent outline
result: [pending]

### 6. Layout pixel heights match spec
expected: Toolbar height = 40px, VizPicker strip = 32px (verify in DevTools computed styles)
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
