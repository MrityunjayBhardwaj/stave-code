/**
 * PreviewProvider — Phase 10.2 Task 03.
 *
 * The minimal interface that `PreviewView` uses to render visual output for
 * a workspace file. Concrete providers (`HYDRA_VIZ`, `P5_VIZ`, ...) land in
 * Task 06; this file defines the shape they must satisfy and the context
 * object `PreviewView` hands to `provider.render()` on every reload.
 *
 * @remarks
 * ## Why in its own file, not `types.ts`?
 *
 * `types.ts` is the frozen vocabulary for primitive workspace values
 * (`WorkspaceFile`, `AudioPayload`, `AudioSourceRef`). The provider
 * contract is a behavioral interface tied to the concrete provider
 * registry, and it references React types (`React.ReactNode`) that
 * `types.ts` is meant to stay clear of (the comment on `types.ts` is
 * explicit: "No runtime code, no imports that bring in React or DOM
 * APIs"). Hoisting `PreviewProvider` into its own file keeps `types.ts`
 * framework-agnostic and gives Task 06's registry a natural place to
 * import from.
 *
 * ## Contract surface
 *
 * Every provider exposes:
 *
 * - `extensions` — the set of file extensions the provider claims. The
 *   Task 06 registry keys lookups by this set.
 * - `label` — human-readable provider name for UI affordances (dropdown
 *   tooltip, error messages).
 * - `keepRunningWhenHidden` — per CONTEXT D-03. `true` means the provider
 *   wants to keep rendering even when its tab is hidden (e.g., long-lived
 *   audio visualizers that need to track state continuously). `false`
 *   means `PreviewView` pauses the render loop by passing `hidden: true`
 *   through the context AND freezing the debounce timer.
 * - `reload` — per CONTEXT D-07. Three modes:
 *     - `'instant'` — re-render on every file content change, no debounce.
 *     - `'debounced'` — re-render after `debounceMs` of quiescence. Used
 *       for compilation-heavy providers (HYDRA_VIZ, P5_VIZ) where every
 *       keystroke shouldn't trigger a full compile.
 *     - `'manual'` — provider handles its own reload trigger.
 *       `PreviewView` never re-renders on content change; the provider is
 *       responsible for watching the file itself or exposing a reload
 *       button in its rendered output.
 * - `debounceMs` — required when `reload === 'debounced'`. Ignored
 *   otherwise.
 * - `render(ctx)` — returns a `ReactNode` that `PreviewView` mounts. Every
 *   reload replaces the returned node (PreviewView handles the React
 *   reconciliation). Providers that need to preserve state across reloads
 *   must do so inside their returned component via refs/closures; the
 *   `PreviewView` host does not persist anything on their behalf.
 *
 * ## PreviewContext — what the provider sees
 *
 * - `file` — the current `WorkspaceFile` snapshot. Reactive via
 *   `useWorkspaceFile` inside `PreviewView`; every render gets the latest
 *   content.
 * - `audioSource` — the current `AudioPayload | null` for the tab's
 *   `sourceRef`, taken from the bus subscription. `null` means no
 *   publisher matches the ref; the provider is responsible for showing
 *   demo-mode fallback content (P7 — the host must not paper over null
 *   with a placeholder).
 * - `hidden` — true when the tab is hidden AND the provider opted out of
 *   background rendering (`keepRunningWhenHidden === false`).
 */

import type { ReactNode } from 'react'
import type { AudioPayload, WorkspaceFile } from './types'

/**
 * Reload policy per CONTEXT D-07. Encoded as a string literal rather than
 * a boolean so the three states stay distinguishable at call sites:
 *
 *   - `'debounced'` — the common case for compile-heavy providers.
 *   - `'instant'` — for cheap previews (e.g., markdown HTML rendering).
 *   - `'manual'` — for providers that own their own trigger (e.g., a
 *     user-driven "Run" button inside the rendered output).
 *
 * Adding a new mode requires updating `PreviewView`'s reload dispatch
 * switch. The exhaustiveness check there (a `never`-typed default case)
 * catches missing branches at compile time.
 */
export type PreviewReloadPolicy = 'debounced' | 'instant' | 'manual'

/**
 * The runtime context handed to `PreviewProvider.render()` on every
 * reload. Fields are reactive — they represent a snapshot of the preview
 * state at the moment `render` was called. The provider's returned React
 * tree may hold onto `ctx` in a closure, but subsequent renders will
 * receive fresh `ctx` objects; providers that care about "the latest"
 * should read from the newest render's ctx, not cache the original.
 */
export interface PreviewContext {
  /**
   * The workspace file being previewed. Reactive via `useWorkspaceFile`
   * inside `PreviewView`. On every reload triggered by content change,
   * this field holds the newest content.
   */
  readonly file: WorkspaceFile

  /**
   * The current bus payload for the tab's `sourceRef`, or `null` if no
   * publisher matches. Providers MUST handle the `null` case with demo-mode
   * fallback content (CONTEXT P7). `PreviewView` deliberately passes `null`
   * through rather than substituting a placeholder, so the provider can
   * render something meaningful even in the "no audio source" state.
   */
  readonly audioSource: AudioPayload | null

  /**
   * `true` when the tab is hidden AND the provider opted out of background
   * rendering (`keepRunningWhenHidden === false`). Providers that receive
   * `hidden: true` should stop rendering expensive frames (e.g., pause
   * their RAF loop) but stay mounted — `PreviewView` will trigger one
   * catch-up reload when the tab becomes visible again.
   */
  readonly hidden: boolean
}

/**
 * The provider contract. Every extension module exports one or more
 * `PreviewProvider` values and the Task 06 registry keys them by
 * `extensions`. For Task 03 this interface is the stub — no concrete
 * providers ship yet.
 */
export interface PreviewProvider {
  /**
   * File extensions this provider claims, WITHOUT the leading dot
   * (e.g., `['hydra']`, not `['.hydra']`). The registry (Task 06) maps
   * `WorkspaceFile.language` to the provider via this field.
   */
  readonly extensions: readonly string[]

  /**
   * Human-readable label used in diagnostic messages, dropdown tooltips,
   * and the source-selector chrome.
   */
  readonly label: string

  /**
   * `true` if the provider's render output should keep running while the
   * tab is hidden; `false` if it should pause.
   *
   * Per CONTEXT D-03: pattern runtimes are implicitly always-on (their
   * chrome, not their render, is what users interact with). Viz previews
   * (`HYDRA_VIZ`, `P5_VIZ`) default to `false` — no point burning a GPU
   * frame on an invisible canvas. `PreviewView` uses this flag to decide
   * whether to freeze the reload debounce when its `hidden` prop flips.
   */
  readonly keepRunningWhenHidden: boolean

  /**
   * Per CONTEXT D-07 — see `PreviewReloadPolicy` doc above.
   */
  readonly reload: PreviewReloadPolicy

  /**
   * Debounce window in milliseconds. Required when `reload === 'debounced'`.
   * Ignored by the host in the other two modes.
   */
  readonly debounceMs?: number

  /**
   * Render the provider's output given a snapshot of the preview context.
   * Called ONCE on mount, then AGAIN on every reload event. Every call
   * should return a fresh `ReactNode`; `PreviewView` reconciles the tree
   * via React's normal rendering path. Do not return the same node twice
   * expecting React to treat it as unchanged — snapshot identity lives in
   * the ctx fields, not in the return value.
   */
  render(ctx: PreviewContext): ReactNode

  /**
   * Optional chrome rendered on the EDITOR tab for files this provider
   * claims. Gives viz files a discoverable action bar (Preview to Side,
   * Background toggle, Save, Hot-reload toggle) matching the transport
   * chrome pattern files get from their runtime provider.
   *
   * If omitted, the editor tab has no chrome for this file type.
   */
  renderEditorChrome?(ctx: PreviewEditorChromeContext): ReactNode
}

/**
 * Context handed to `PreviewProvider.renderEditorChrome()`. Contains the
 * file being edited and action callbacks the chrome can invoke. The shell
 * wires these callbacks to the command registry and the viz preset bridge.
 */
export interface PreviewEditorChromeContext {
  /** The workspace file this editor tab is bound to. */
  readonly file: WorkspaceFile
  /**
   * Toggle the preview for this file in a sibling split group.
   *
   * If no preview tab currently exists for this file, opens a new one
   * in a split-right group (Cmd+K V behavior). If one already exists,
   * closes it instead — so a "▶ Play" → "■ Stop" toggle on the chrome
   * button has coherent semantics for viz files whose "play" means
   * "show me the rendered canvas."
   *
   * The optional `sourceRef` argument pins the new preview tab to a
   * specific audio source when opening. The chrome's source dropdown
   * passes the user's selection through this parameter so the preview
   * subscribes to the chosen publisher (a pattern file, the sample
   * sound, or `'none'` for demo mode) from the moment it mounts —
   * avoiding the default-tracking fallback that would otherwise race
   * the user's pattern-start clicks.
   *
   * The chrome reads `previewOpen` below to render the correct label
   * and icon; it calls this single callback for both open and close.
   */
  readonly onOpenPreview: (sourceRef?: import('./types').AudioSourceRef) => void
  /**
   * Whether a preview tab for this file currently exists in any group.
   * The chrome uses this to render the primary button as `▶ Play` (no
   * preview open) or `■ Stop` (preview open). Maintained by the shell
   * — embedders of `PreviewView` directly (outside the shell) can
   * leave this as `undefined`, in which case the chrome defaults to
   * `▶ Play`.
   */
  readonly previewOpen?: boolean
  /** Toggle the background decoration (viz behind the editor). */
  readonly onToggleBackground: () => void
  /** Save the file back to its persistent store (VizPresetStore). */
  readonly onSave: () => void
  /**
   * Whether hot-reload is currently enabled.
   *
   * Optional because Phase 10.2 ships a provider-level `reload` policy
   * (per-provider, not per-tab) so most chromes render this as a static
   * "live" indicator rather than a toggle. A per-tab toggle would
   * require threading state through `PreviewView.reload` — scoped to a
   * follow-up phase.
   */
  readonly hotReload?: boolean
  /** Toggle hot-reload on/off. Optional — see `hotReload` above. */
  readonly onToggleHotReload?: () => void
}
