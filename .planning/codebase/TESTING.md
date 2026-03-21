# Testing Patterns

**Analysis Date:** 2026-03-21

## Test Framework

**Runner:**
- Vitest 1.6.0
- Config: `packages/editor/vitest.config.ts`
- Environment: jsdom (browser simulation)
- Globals enabled (describe/it/expect available without imports)

**Vitest Configuration:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

**Assertion Library:**
- Vitest built-in expect (compatible with Jest)
- Full expect API available (toBe, toMatch, async assertions, etc.)

**Run Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode (re-run on file change)
# Coverage command not configured — can use vitest --coverage if needed
```

**Package Dependencies for Testing:**
- `vitest: ^1.6.0` — Test runner
- `jsdom: ^24.0.0` — DOM simulation
- `@testing-library/react: ^16.0.0` — React component testing utilities

## Test File Organization

**Location:**
- Co-located with source: Test files sit next to implementation
- Example: `src/engine/WavEncoder.test.ts` alongside `src/engine/WavEncoder.ts`

**Naming:**
- Pattern: `[ImplementationName].test.ts`
- Single test file per module (WavEncoder has one .test.ts file)

**Structure:**
```
packages/editor/
├── src/
│   └── engine/
│       ├── WavEncoder.ts
│       ├── WavEncoder.test.ts    # Test file co-located
│       ├── StrudelEngine.ts
│       ├── HapStream.ts
│       └── LiveRecorder.ts       # No test file — untested
```

## Test Structure

**Suite Organization:**
```typescript
// WavEncoder.test.ts pattern
describe('WavEncoder', () => {
  it('produces a valid RIFF WAV header', () => {
    // Test body
  })

  it('clamps samples outside [-1, 1] without throwing', () => {
    // Test body
  })

  it('encodes AudioBuffer via encode()', () => {
    // Test body
  })
})
```

**Patterns:**
- `describe()` wraps all tests for a class/module
- `it()` names each test descriptively (what should happen)
- No explicit setup/teardown (tests are independent)
- Tests don't share state between cases

## Test Coverage Analysis

**Tested:**
- `WavEncoder` (5 tests covering encoding logic)
  - RIFF header format validation
  - Sample clamping behavior
  - AudioBuffer encoding
  - Mono/stereo fallback
  - Multiple chunk handling

**Not Tested:**
- `StrudelEngine` — No test file
- `HapStream` — No test file
- `OfflineRenderer` — No test file
- `LiveRecorder` — No test file
- React components (`StrudelEditor`, `Toolbar`, `StrudelMonaco`) — No test files
- Theme system (`tokens.ts`) — No test file
- Utility functions (`noteToMidi.ts`) — No test file

**Coverage Estimation:**
- Approximate coverage: <5% of source code
- Only WAV encoding logic is tested
- Audio context integration, React components, and UI logic untested

## Test Examples

**Example 1: WAV Header Validation**
```typescript
it('produces a valid RIFF WAV header', () => {
  const sampleRate = 44100
  const numSamples = 4410 // 0.1s of silence
  const L = new Float32Array(numSamples)
  const R = new Float32Array(numSamples)

  const blob = WavEncoder.encodeChunks([L], [R], sampleRate)

  expect(blob.type).toBe('audio/wav')

  return blob.arrayBuffer().then((buf) => {
    const view = new DataView(buf)

    // RIFF header
    const riff = String.fromCharCode(
      view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
    )
    expect(riff).toBe('RIFF')

    // WAVE marker
    const wave = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
    )
    expect(wave).toBe('WAVE')

    // fmt chunk
    const fmt = String.fromCharCode(
      view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)
    )
    expect(fmt).toBe('fmt ')

    // PCM format = 1
    expect(view.getUint16(20, true)).toBe(1)
    // Channels = 2
    expect(view.getUint16(22, true)).toBe(2)
    // Sample rate
    expect(view.getUint32(24, true)).toBe(sampleRate)
    // Bits per sample = 16
    expect(view.getUint16(34, true)).toBe(16)

    // data chunk
    const data = String.fromCharCode(
      view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)
    )
    expect(data).toBe('data')

    // data size = numSamples * 2 channels * 2 bytes
    expect(view.getUint32(40, true)).toBe(numSamples * 2 * 2)

    // Total blob size = 44 (header) + data
    expect(buf.byteLength).toBe(44 + numSamples * 4)
  })
})
```

**Example 2: Error Handling (Non-Throwing)**
```typescript
it('clamps samples outside [-1, 1] without throwing', () => {
  const L = new Float32Array([2.0, -3.0, 0.5])
  const R = new Float32Array([1.5, -1.5, 0.0])

  expect(() => WavEncoder.encodeChunks([L], [R], 44100)).not.toThrow()
})
```

**Example 3: Async Testing (Promise Return)**
```typescript
it('encodes AudioBuffer via encode()', () => {
  const sampleRate = 48000
  const length = 480

  // Minimal AudioBuffer stub
  const fakeBuffer = {
    numberOfChannels: 2,
    sampleRate,
    getChannelData: (ch: number) => new Float32Array(length),
  } as unknown as AudioBuffer

  const blob = WavEncoder.encode(fakeBuffer)
  expect(blob.type).toBe('audio/wav')

  return blob.arrayBuffer().then((buf) => {
    expect(buf.byteLength).toBe(44 + length * 4)
  })
})
```

**Pattern: Async/Promise Testing**
- Return a Promise from the test function
- Vitest automatically waits for it to resolve
- No need for explicit `async`/`await` in most cases (though supported)

**Pattern: Browser Environment**
```typescript
// @vitest-environment node  ← Override default jsdom when needed
import { describe, it, expect } from 'vitest'
```

## Mocking

**Framework:** Vitest built-in mocking (no additional libraries)

**Patterns Observed:**
- Manual stub objects for AudioBuffer (see test example above)
- No mock function patterns detected in current tests
- No spy patterns (jest.fn, vi.spyOn) in use

**Stubbing Example:**
```typescript
// WavEncoder.test.ts
const fakeBuffer = {
  numberOfChannels: 2,
  sampleRate,
  getChannelData: (ch: number) => new Float32Array(length),
} as unknown as AudioBuffer
```

**What to Mock:**
- Web Audio API objects (AudioBuffer, OfflineAudioContext) when needed
- External Strudel API responses when testing pattern evaluation
- React components that depend on StrudelEngine

**What NOT to Mock:**
- Core encoding logic (WavEncoder) — test real implementations
- Simple utility functions (noteToMidi) — test actual behavior
- Frame-by-frame data transformations — verify exact output

## Fixtures and Factories

**Test Data:**
- No formal fixture files or factories found
- Test data created inline within test cases
- Float32Arrays initialized directly in tests

**Example:**
```typescript
const chunk1L = new Float32Array([0.1, 0.2])
const chunk2L = new Float32Array([0.3, 0.4])
const chunk1R = new Float32Array([0.1, 0.2])
const chunk2R = new Float32Array([0.3, 0.4])
```

**Location:**
- Inline in test file (no separate `fixtures/` or `test-data/` directories)
- Could be refactored to shared factory functions if tests grow

## Coverage

**Current Status:**
- No coverage configured in vitest.config.ts
- No coverage reports generated
- Minimum/target coverage: Not enforced

**View Coverage:**
```bash
# Not currently configured, but would add:
vitest --coverage
# Then check coverage reports in coverage/ directory
```

## Test Types

**Unit Tests:**
- Scope: Single function or method behavior
- Approach: Test input → output with various cases
- Example: `WavEncoder.encodeChunks()` with different sample rates and channels
- Current coverage: Only encoding utilities have unit tests

**Integration Tests:**
- Scope: Component behavior with mocked/stubbed external services
- Approach: Mount component, trigger actions, verify outputs
- Example: Not implemented — would test `StrudelEditor` with mocked engine
- Current coverage: None

**E2E Tests:**
- Framework: Not used
- Would test: Full user workflows (edit code → play → export)
- Implementation: Could use Vitest browser mode or Playwright

## Common Patterns to Follow

**Async Testing:**
- Return the Promise from the test function:
```typescript
it('handles async operations', () => {
  return somePromise().then((result) => {
    expect(result).toBe(expected)
  })
})
```

- Or use async/await (Vitest supports it):
```typescript
it('handles async operations', async () => {
  const result = await somePromise()
  expect(result).toBe(expected)
})
```

**Error/Exception Testing:**
- Use `expect().not.toThrow()` for functions that should handle errors gracefully:
```typescript
it('clamps samples without throwing', () => {
  expect(() => WavEncoder.encodeChunks([L], [R], 44100)).not.toThrow()
})
```

- Use `expect().rejects.toThrow()` for async error cases:
```typescript
it('rejects on missing engine', async () => {
  await expect(engine.record(5)).rejects.toThrow('not initialized')
})
```

**Testing with Environment Override:**
```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'

// Tests below run in Node environment, not jsdom
```

## Next Steps for Test Coverage

**High Priority (Core Logic):**
- Add tests for `WavEncoder` error cases (already covered)
- Add tests for `noteToMidi()` utility (various note formats)
- Add tests for `OfflineRenderer` pattern evaluation
- Add tests for `StrudelEngine.evaluate()` and initialization

**Medium Priority (Integration):**
- Add tests for `HapStream` event emission and subscribers
- Add tests for `LiveRecorder` capture flow
- Mock-based tests for React components with engine integration

**Lower Priority (UI):**
- `StrudelEditor` component behavior (state management, callbacks)
- `Toolbar` button interactions
- Theme application (`applyTheme()` in `tokens.ts`)

---

*Testing analysis: 2026-03-21*
