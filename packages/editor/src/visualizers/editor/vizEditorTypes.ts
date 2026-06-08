import type { VizPreset } from '../vizPreset'
import { languageForRenderer } from '../../workspace/vizLanguages'

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
    language: languageForRenderer(preset.renderer),
    preset,
    dirty: false,
  }
}

