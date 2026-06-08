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
    language:
      preset.renderer === 'hydra' ? 'hydra' : preset.renderer === 'glsl' ? 'glsl' : 'p5js',
    preset,
    dirty: false,
  }
}

