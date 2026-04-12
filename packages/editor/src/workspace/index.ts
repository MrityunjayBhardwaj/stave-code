/**
 * @stave/editor — workspace module barrel.
 *
 * Phase 10.2 public surface. Grows task by task.
 *
 * Task 01:
 * - Types: WorkspaceFile, WorkspaceLanguage
 * - Store:  createWorkspaceFile, getFile, setContent, subscribe
 * - Hook:   useWorkspaceFile
 *
 * Task 02:
 * - Types: AudioSourceRef, AudioPayload, AudioSourceListing,
 *          WorkspaceAudioBus
 * - Bus:   workspaceAudioBus (singleton)
 *
 * Task 03:
 * - Types: EditorViewProps, PreviewViewProps, WorkspaceTheme,
 *          PreviewProvider, PreviewContext, PreviewReloadPolicy
 * - Views: EditorView, PreviewView
 * - Util:  ensureWorkspaceLanguages, toMonacoLanguage
 *
 * Task 04:
 * - Types: WorkspaceTab, WorkspaceGroupState, WorkspaceShellProps,
 *          ChromeForTab, LiveCodingRuntimeProviderStub
 * - Shell: WorkspaceShell
 *
 * Task 05:
 * - Types:    LiveCodingRuntime, LiveCodingRuntimeProvider, ChromeContext
 * - Class:    LiveCodingRuntime (in runtime/)
 * - Registry: liveCodingRuntimeRegistry, register/get* helpers
 * - Built-ins: STRUDEL_RUNTIME, SONICPI_RUNTIME
 *
 * Task 06:
 * - Registry:   previewProviderRegistry, register/get* helpers
 * - Built-ins:  HYDRA_VIZ, P5_VIZ (MARKDOWN_HTML deferred per U7)
 * - Bridge:     seedFromPreset, seedFromPresetId, flushToPreset
 *               (viz preset ↔ workspace file, per S6)
 *
 * Task 08:
 * - Types:    WorkspaceCommand, CommandContext, WorkspaceShellActions
 * - Registry: registerCommand, getCommand, executeCommand
 * - Hook:     useKeyboardCommands (Cmd+K V/B/W chord detection)
 * - Built-ins: workspace.openPreviewToSide, workspace.toggleBackgroundPreview,
 *              workspace.openPreviewInWindow
 */

export type { WorkspaceFile, WorkspaceLanguage } from './types'
export type {
  AudioSourceRef,
  AudioPayload,
  AudioSourceListing,
  WorkspaceAudioBus,
} from './types'
export type {
  EditorViewProps,
  PreviewViewProps,
  WorkspaceTheme,
} from './types'
export type {
  WorkspaceTab,
  WorkspaceGroupState,
  WorkspaceShellProps,
  ChromeForTab,
  LiveCodingRuntimeProviderStub,
} from './types'
export type {
  LiveCodingRuntime as LiveCodingRuntimeInterface,
  LiveCodingRuntimeProvider,
  ChromeContext,
} from './types'
export {
  LiveCodingRuntime,
  extractBpmFromCode,
  liveCodingRuntimeRegistry,
  registerRuntimeProvider,
  getRuntimeProviderForExtension,
  getRuntimeProviderForLanguage,
  STRUDEL_RUNTIME,
  SONICPI_RUNTIME,
} from './runtime'
export {
  createWorkspaceFile,
  seedWorkspaceFile,
  getFile,
  setContent,
  subscribe,
} from './WorkspaceFile'
export {
  initProjectDoc,
  initProjectDocSync,
  isDocReady,
} from './projectDoc'
export { useWorkspaceFile } from './useWorkspaceFile'
export type { UseWorkspaceFileResult } from './useWorkspaceFile'
export { workspaceAudioBus } from './WorkspaceAudioBus'
export { EditorView } from './EditorView'
export { PreviewView } from './PreviewView'
export { WorkspaceShell } from './WorkspaceShell'
export type {
  PreviewProvider,
  PreviewContext,
  PreviewReloadPolicy,
} from './PreviewProvider'
export {
  previewProviderRegistry,
  registerPreviewProvider,
  getPreviewProviderForExtension,
  getPreviewProviderForLanguage,
  createCompiledVizProvider,
  HYDRA_VIZ,
  P5_VIZ,
  seedFromPreset,
  seedFromPresetId,
  flushToPreset,
  workspaceFileIdForPreset,
  languageForPresetRenderer,
  getPresetIdForFile,
} from './preview'
export {
  ensureWorkspaceLanguages,
  toMonacoLanguage,
} from './languages'

// Task 08 — Command registry + Cmd+K V/B/W
export type {
  WorkspaceCommand,
  CommandContext,
  WorkspaceShellActions,
} from './commands'
export {
  registerCommand,
  getCommand,
  executeCommand,
  resetCommandRegistryForTests,
} from './commands'
export {
  useKeyboardCommands,
  type UseKeyboardCommandsOptions,
} from './commands'
