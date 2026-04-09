/**
 * @stave/editor — workspace module barrel.
 *
 * Phase 10.2 public surface. Grows task by task; Task 01 seeds:
 *
 * - Types: WorkspaceFile, WorkspaceLanguage
 * - Store:  createWorkspaceFile, getFile, setContent, subscribe
 * - Hook:   useWorkspaceFile
 */

export type { WorkspaceFile, WorkspaceLanguage } from './types'
export {
  createWorkspaceFile,
  getFile,
  setContent,
  subscribe,
} from './WorkspaceFile'
export { useWorkspaceFile } from './useWorkspaceFile'
export type { UseWorkspaceFileResult } from './useWorkspaceFile'
