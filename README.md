# struCode

A Monaco-based [Strudel.js](https://strudel.cc) editor built as an embeddable React component library.

## What it is

struCode replaces the default strudel-editor with a professional editing experience:

- **Active highlighting** — characters in the source code glow in sync with the audio scheduler
- **Sound autocompletion** — `s("...")` suggests all loaded Dirt-Samples and synth names
- **Runtime error surfacing** — scheduler-time errors (e.g. unknown sounds) appear in the editor UI, not just the console
- **WAV export** — offline fast-render via `OfflineAudioContext` (50× realtime) and live capture
- **Multi-stem export** — render each pattern to a separate WAV in parallel
- Monaco language support — syntax highlighting, bracket matching, keyboard shortcuts

Planned: inline pianoroll, oscilloscope, spectrum analyser, hover docs, error squiggles.

## Packages

| Package | Description |
|---------|-------------|
| `packages/editor` | React component library (`@strucode/editor`) |
| `packages/app` | Next.js demo app |

## Quick start

```bash
pnpm install
pnpm dev          # starts the Next.js demo at localhost:3000
```

## Usage

```tsx
import { StrudelEditor } from '@strucode/editor'

<StrudelEditor
  defaultCode={`$: note("c3 e3 g3").s("sine")`}
  onError={(err) => console.error(err)}
/>
```

## Stack

- Monaco Editor (`@monaco-editor/react`)
- Strudel (`@strudel/core`, `@strudel/webaudio`, `@strudel/mini`, `@strudel/tonal`, …)
- React 19, Next.js 16, TypeScript, pnpm workspaces, tsup

## License

MIT
