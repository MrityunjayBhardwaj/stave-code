import type { VizPreset } from '../vizPreset'

export interface VizTab {
  id: string
  label: string
  language: string
  preset: VizPreset
  dirty: boolean
}

export type PreviewMode = 'panel' | 'inline' | 'background' | 'popout'

export interface EditorGroupState {
  id: string
  tabs: VizTab[]
  activeTabId: string | null
  previewMode: PreviewMode
}

export interface DragPayload {
  sourceGroupId: string
  tabId: string
}

export function presetToTab(preset: VizPreset): VizTab {
  return {
    id: preset.id,
    label: `${preset.name}.${preset.renderer}`,
    language: preset.renderer === 'hydra' ? 'hydra' : 'p5js',
    preset,
    dirty: false,
  }
}

export const HYDRA_TEMPLATE = `// Audio-reactive Hydra visualization
// s.a.fft[0]=bass  s.a.fft[1]=low-mid  s.a.fft[2]=high-mid  s.a.fft[3]=treble

s.osc(10, 0.1, () => s.a.fft[0] * 4)
  .color(1.0, 0.5, () => s.a.fft[1] * 2)
  .rotate(() => s.a.fft[2] * 6.28)
  .out()
`

export const P5_TEMPLATE = `// p5.js sketch — hapStream, analyser, scheduler available

background(9, 9, 18)
const now = scheduler?.now() ?? 0
const events = scheduler?.query(now - 2, now + 2) ?? []

for (const e of events) {
  const x = ((e.begin - now + 2) / 4) * width
  const y = (1 - (e.note ?? 60) / 127) * height
  fill(117, 186, 255)
  ellipse(x, y, 8, 8)
}
`
