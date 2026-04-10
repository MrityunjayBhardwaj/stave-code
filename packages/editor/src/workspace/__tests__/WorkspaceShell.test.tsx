/**
 * WorkspaceShell — unit tests (Phase 10.2 Task 04).
 *
 * Covers the shell's observable contract:
 *
 *   - Renders with `initialTabs` — one group, first tab becomes active.
 *   - `onActiveTabChange` fires on mount with the initial active tab.
 *   - Clicking a tab switches `activeTabId` and fires `onActiveTabChange`.
 *   - Closing a tab removes it; if the closed tab was active, switches
 *     to the next adjacent tab. `onTabClose` fires with the closed tab.
 *   - Closing the only remaining tab in a group leaves the group empty
 *     (not collapsed). The empty state renders a "Drop a tab here" hint.
 *   - `editor`-kind tabs dispatch to `EditorView`; `preview`-kind tabs
 *     dispatch to `PreviewView` with a stub provider.
 *   - Split group creates a new empty sibling group. SplitPane now wraps
 *     the 2+ groups; the single-group path renders the group directly.
 *   - Close group merges tabs into the neighbor group.
 *   - Drag tab from group A to group B ends up in B, active in B,
 *     removed from A.
 *   - Theme applied via `style.getPropertyValue('--background')` on the
 *     shell root container (PV6 guard).
 *   - PV7 acceptance test — the shell's own source file contains ZERO
 *     occurrences of `previewMode`.
 *
 * ## Why mock `@monaco-editor/react`
 *
 * The shell renders `EditorView` for editor-kind tabs, which mounts
 * Monaco. jsdom cannot run Monaco cleanly; we stub it out the same way
 * `EditorView.test.tsx` does. The stub just writes a div so theme /
 * dispatch assertions still work.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, fireEvent, createEvent, act } from '@testing-library/react'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Mock @monaco-editor/react BEFORE importing anything that reaches for it.
// ---------------------------------------------------------------------------

interface MonacoEditorProps {
  language?: string
  value?: string
  onChange?: (value: string | undefined) => void
  onMount?: (editor: unknown, monaco: unknown) => void
  height?: string | number
  options?: Record<string, unknown>
}

const stubEditor = { id: 'stub-editor' }
const stubMonaco = {
  languages: {
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    getLanguages: vi.fn(() => [] as Array<{ id: string }>),
  },
}

vi.mock('@monaco-editor/react', () => ({
  default: (props: MonacoEditorProps) => {
    React.useEffect(() => {
      props.onMount?.(stubEditor, stubMonaco)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return (
      <div
        data-testid="mock-monaco-editor"
        data-language={props.language ?? ''}
        data-value={props.value ?? ''}
      />
    )
  },
}))

// Mock modules imported transitively by EditorView (Task 07 wiring)
// to avoid loading P5VizRenderer → gifenc (CJS/ESM incompatibility in test).
vi.mock('../../visualizers/defaultDescriptors', () => ({
  DEFAULT_VIZ_DESCRIPTORS: [],
}))
vi.mock('../../visualizers/viewZones', () => ({
  addInlineViewZones: vi.fn(() => ({ cleanup: vi.fn(), pause: vi.fn(), resume: vi.fn() })),
}))
vi.mock('../../monaco/useHighlighting', () => ({
  useHighlighting: vi.fn(() => ({ clearAll: vi.fn() })),
}))
vi.mock('../../monaco/diagnostics', () => ({
  setEvalError: vi.fn(),
  clearEvalErrors: vi.fn(),
}))

import { WorkspaceShell } from '../WorkspaceShell'
import {
  createWorkspaceFile,
  __resetWorkspaceFilesForTests,
} from '../WorkspaceFile'
import { __resetWorkspaceLanguagesForTests } from '../languages'
import { __resetWorkspaceAudioBusForTests } from '../WorkspaceAudioBus'
import type {
  PreviewProvider,
  PreviewContext,
} from '../PreviewProvider'
import type { WorkspaceTab } from '../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreviewProvider(): PreviewProvider {
  return {
    extensions: ['hydra'],
    label: 'Test Preview',
    keepRunningWhenHidden: false,
    reload: 'instant',
    render(ctx: PreviewContext) {
      return (
        <div
          data-testid="stub-preview-output"
          data-file-content={ctx.file.content}
        />
      )
    },
  }
}

function seedFiles() {
  createWorkspaceFile('f-strudel', 'main.strudel', '// strudel code', 'strudel')
  createWorkspaceFile('f-hydra', 'viz.hydra', '// hydra code', 'hydra')
  createWorkspaceFile('f-p5', 'sketch.p5', '// p5 code', 'p5js')
}

function editorTab(id: string, fileId: string): WorkspaceTab {
  return { kind: 'editor', id, fileId }
}

function previewTab(id: string, fileId: string): WorkspaceTab {
  return {
    kind: 'preview',
    id,
    fileId,
    sourceRef: { kind: 'default' },
  }
}

describe('WorkspaceShell', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
    __resetWorkspaceLanguagesForTests()
    __resetWorkspaceAudioBusForTests()
    seedFiles()
  })

  describe('initial render', () => {
    it('seeds a single group with the provided tabs and activates the first', () => {
      const tabs = [
        editorTab('t-strudel', 'f-strudel'),
        editorTab('t-hydra', 'f-hydra'),
      ]
      const { getByTestId, container } = render(
        <WorkspaceShell initialTabs={tabs} />,
      )
      // Shell root exists.
      expect(
        container.querySelector('[data-workspace-shell="root"]'),
      ).not.toBeNull()
      // One group rendered.
      const groups = container.querySelectorAll('[data-workspace-group]')
      expect(groups.length).toBe(1)
      // Both tabs present in the tab bar.
      expect(
        container.querySelectorAll('[data-workspace-tab]').length,
      ).toBe(2)
      // First tab is active.
      const firstTab = container.querySelector(
        '[data-workspace-tab="t-strudel"]',
      )
      expect(firstTab?.getAttribute('data-tab-active')).toBe('true')
      // And its content area shows Monaco for the strudel file.
      const mock = getByTestId('mock-monaco-editor')
      expect(mock.getAttribute('data-value')).toBe('// strudel code')
      expect(mock.getAttribute('data-language')).toBe('strudel')
    })

    it('fires onActiveTabChange on mount with the initial active tab', () => {
      const tabs = [editorTab('t-strudel', 'f-strudel')]
      const onActiveTabChange = vi.fn()
      render(
        <WorkspaceShell
          initialTabs={tabs}
          onActiveTabChange={onActiveTabChange}
        />,
      )
      expect(onActiveTabChange).toHaveBeenCalledTimes(1)
      expect(onActiveTabChange).toHaveBeenCalledWith(tabs[0])
    })

    it('renders the empty state when no tabs are seeded', () => {
      const { container } = render(<WorkspaceShell initialTabs={[]} />)
      const empty = container.querySelector('[data-testid^="group-empty-"]')
      expect(empty).not.toBeNull()
      expect(empty?.textContent).toContain('Drop a tab here')
    })
  })

  describe('tab click', () => {
    it('changes the active tab and fires onActiveTabChange', () => {
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const onActiveTabChange = vi.fn()
      const { container } = render(
        <WorkspaceShell
          initialTabs={tabs}
          onActiveTabChange={onActiveTabChange}
        />,
      )
      onActiveTabChange.mockClear()
      const tabB = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      fireEvent.click(tabB)
      // Active flag flipped.
      expect(
        container
          .querySelector('[data-workspace-tab="t-b"]')
          ?.getAttribute('data-tab-active'),
      ).toBe('true')
      // Callback fired.
      expect(onActiveTabChange).toHaveBeenCalledWith(tabs[1])
    })
  })

  describe('tab close', () => {
    it('removes a tab and switches to the next adjacent tab', () => {
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const onTabClose = vi.fn()
      const { container, getByTestId } = render(
        <WorkspaceShell initialTabs={tabs} onTabClose={onTabClose} />,
      )
      // Close the first (active) tab.
      const closeBtn = getByTestId('tab-close-t-a')
      fireEvent.click(closeBtn)
      // Only one tab left.
      expect(
        container.querySelectorAll('[data-workspace-tab]').length,
      ).toBe(1)
      // t-b is now active.
      expect(
        container
          .querySelector('[data-workspace-tab="t-b"]')
          ?.getAttribute('data-tab-active'),
      ).toBe('true')
      // onTabClose fired with the closed tab.
      expect(onTabClose).toHaveBeenCalledTimes(1)
      expect(onTabClose).toHaveBeenCalledWith(tabs[0])
    })

    it('leaves the group empty when the last tab is closed', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container, getByTestId } = render(
        <WorkspaceShell initialTabs={tabs} />,
      )
      fireEvent.click(getByTestId('tab-close-t-a'))
      // Group still exists but has no tabs and shows the drop hint.
      expect(
        container.querySelectorAll('[data-workspace-tab]').length,
      ).toBe(0)
      expect(
        container.querySelector('[data-testid^="group-empty-"]'),
      ).not.toBeNull()
    })
  })

  describe('tab dispatch by kind', () => {
    it('editor-kind dispatches to EditorView (renders Monaco stub)', () => {
      const tabs = [editorTab('t-e', 'f-strudel')]
      const { getByTestId, container } = render(
        <WorkspaceShell initialTabs={tabs} />,
      )
      expect(getByTestId('mock-monaco-editor')).toBeTruthy()
      expect(
        container.querySelector('[data-workspace-view="editor"]'),
      ).not.toBeNull()
    })

    it('preview-kind dispatches to PreviewView with the provided provider', () => {
      const tabs = [previewTab('t-p', 'f-hydra')]
      const provider = makePreviewProvider()
      const { getByTestId, container } = render(
        <WorkspaceShell
          initialTabs={tabs}
          previewProviderFor={() => provider}
        />,
      )
      expect(getByTestId('stub-preview-output')).toBeTruthy()
      expect(
        container.querySelector('[data-workspace-view="preview"]'),
      ).not.toBeNull()
    })

    it('preview-kind with no provider renders the no-provider message', () => {
      const tabs = [previewTab('t-p', 'f-hydra')]
      const { getByTestId } = render(
        <WorkspaceShell initialTabs={tabs} previewProviderFor={() => undefined} />,
      )
      expect(getByTestId('preview-no-provider-t-p')).toBeTruthy()
    })

    it('passes chromeForTab output into the EditorView chrome slot', () => {
      const tabs = [editorTab('t-e', 'f-strudel')]
      const { container } = render(
        <WorkspaceShell
          initialTabs={tabs}
          chromeForTab={(tab) =>
            tab.kind === 'editor' ? (
              <div data-testid={`chrome-for-${tab.id}`}>chrome!</div>
            ) : undefined
          }
        />,
      )
      const slot = container.querySelector(
        '[data-workspace-view-slot="chrome"]',
      )
      expect(slot).not.toBeNull()
      expect(slot?.textContent).toBe('chrome!')
    })
  })

  describe('group split', () => {
    it('creates a new sibling group and renders two groups inside a SplitPane', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container, getByTestId } = render(
        <WorkspaceShell initialTabs={tabs} />,
      )
      // Only one group to start with.
      expect(
        container.querySelectorAll('[data-workspace-group]').length,
      ).toBe(1)
      // Find the split button on the initial group (id is generated).
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      expect(splitBtn).not.toBeNull()
      fireEvent.click(splitBtn)
      // Two groups now.
      expect(
        container.querySelectorAll('[data-workspace-group]').length,
      ).toBe(2)
      // The second group is empty — renders the empty-state hint.
      const emptyStates = container.querySelectorAll(
        '[data-testid^="group-empty-"]',
      )
      expect(emptyStates.length).toBe(1)
      // And the close-group button is now visible on both groups.
      const closeBtns = container.querySelectorAll(
        '[data-testid^="group-close-"]',
      )
      expect(closeBtns.length).toBe(2)
      // silence unused warning
      void getByTestId
    })
  })

  describe('group close', () => {
    it('merges tabs from the closed group into the neighbor', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      // Split to create a second empty group.
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      fireEvent.click(splitBtn)
      // Now close the ORIGINAL group (the one with t-a). Find its
      // close-group button via the group id that contains the tab.
      const originalGroup = container
        .querySelector('[data-workspace-tab="t-a"]')
        ?.closest('[data-workspace-group]') as HTMLElement
      const originalGroupId = originalGroup?.getAttribute(
        'data-workspace-group',
      )
      const closeBtn = container.querySelector(
        `[data-testid="group-close-${originalGroupId}"]`,
      ) as HTMLElement
      fireEvent.click(closeBtn)
      // Only one group left.
      expect(
        container.querySelectorAll('[data-workspace-group]').length,
      ).toBe(1)
      // t-a survived the merge and is visible.
      expect(
        container.querySelector('[data-workspace-tab="t-a"]'),
      ).not.toBeNull()
    })

    it('auto-collapses a group when closing its last tab (non-only group)', () => {
      // VS Code parity: closing the × on the last tab of a non-only
      // group should remove the group entirely — no "Drop a tab here"
      // placeholder left behind. Previously the user had to hunt
      // down the tiny group-close × on the chrome bar to dismiss the
      // area, which was effectively hidden.
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      // Split to create a second empty group so we have 2 groups total.
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      fireEvent.click(splitBtn)
      // Now drag t-b into the second group so it's the only tab there.
      // Simpler path for the test: just verify the close-last-tab-of-
      // a-non-only-group behavior by closing t-b first, which leaves
      // only t-a in the original group PLUS the empty second group.
      // Close the empty group via its × so we're at a clean 2-group
      // state with one tab in each? No — simpler: programmatically
      // arrange via public API.
      //
      // The direct test: close t-a while 2 groups exist. t-a is the
      // last tab of its group → group should collapse.
      const tabACloseBtn = container.querySelector(
        '[data-testid="tab-close-t-a"]',
      ) as HTMLElement
      // Close t-b first (so the first group has only t-a).
      const tabBCloseBtn = container.querySelector(
        '[data-testid="tab-close-t-b"]',
      ) as HTMLElement
      fireEvent.click(tabBCloseBtn)
      // Now the first group has only t-a; the second group (from
      // split) is still empty. Close t-a → group should collapse AND
      // leave us with just the empty split group.
      fireEvent.click(tabACloseBtn)
      const groupsAfter = container.querySelectorAll(
        '[data-workspace-group]',
      )
      // Exactly one group remains (the empty split one). The
      // collapse-on-last-tab eliminated the original group.
      expect(groupsAfter.length).toBe(1)
    })

    it('leaves the only group intact when closing its last tab', () => {
      // Edge case: if closing the last tab of the ONLY group, we
      // cannot remove that group (the shell would have nothing to
      // render). The group stays, empty. This preserves the
      // "Drop a tab here" placeholder as the zero-tab fallback.
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      const tabACloseBtn = container.querySelector(
        '[data-testid="tab-close-t-a"]',
      ) as HTMLElement
      fireEvent.click(tabACloseBtn)
      const groupsAfter = container.querySelectorAll(
        '[data-workspace-group]',
      )
      // Still one group, but now empty.
      expect(groupsAfter.length).toBe(1)
    })

    it('ignores close-group when only one group exists', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      // With only one group, the close-group button is not rendered
      // (canClose === false). That's the "ignore" behavior.
      expect(
        container.querySelector('[data-testid^="group-close-"]'),
      ).toBeNull()
    })
  })

  describe('drag-drop between groups', () => {
    it('moves a tab from group A to group B and activates it there', () => {
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      // Split to create a second group.
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      fireEvent.click(splitBtn)

      const groupEls = container.querySelectorAll(
        '[data-workspace-group]',
      ) as NodeListOf<HTMLElement>
      expect(groupEls.length).toBe(2)
      const sourceGroupId = groupEls[0].getAttribute('data-workspace-group')!
      const targetGroupId = groupEls[1].getAttribute('data-workspace-group')!

      // Simulate dragstart on t-b — we need a DataTransfer shim because
      // jsdom's fireEvent.dragStart sets one up but doesn't persist
      // setData across the subsequent drop.
      const dataStore: Record<string, string> = {}
      const dataTransfer = {
        setData: (type: string, value: string) => {
          dataStore[type] = value
        },
        getData: (type: string) => dataStore[type] ?? '',
        types: [] as string[],
        effectAllowed: '',
        dropEffect: '',
      }

      const tabB = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      fireEvent.dragStart(tabB, { dataTransfer })
      dataTransfer.types.push('application/workspace-tab')

      // DragOver + drop on the target group (the empty one).
      const targetGroupEl = groupEls[1]
      fireEvent.dragOver(targetGroupEl, { dataTransfer })
      fireEvent.drop(targetGroupEl, { dataTransfer })

      // t-b should now be inside the target group.
      const tbAfter = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      const containingGroup = tbAfter.closest('[data-workspace-group]')
      expect(containingGroup?.getAttribute('data-workspace-group')).toBe(
        targetGroupId,
      )
      expect(tbAfter.getAttribute('data-tab-active')).toBe('true')

      // And t-a should still be in the source group.
      const taAfter = container.querySelector(
        '[data-workspace-tab="t-a"]',
      ) as HTMLElement
      expect(
        taAfter
          .closest('[data-workspace-group]')
          ?.getAttribute('data-workspace-group'),
      ).toBe(sourceGroupId)
    })

    it('splits within the same group when dragging a tab to its own directional quadrant', () => {
      // The common case: all seed tabs start in ONE group. The user
      // drags a tab to the east quadrant of that same group expecting
      // a new split to appear. This regression test makes sure the
      // drop handler does not early-return just because source and
      // target are the same group.
      //
      // Implementation note: React Testing Library's `fireEvent.drop`
      // with `{ clientX, clientY }` in the init dict does NOT propagate
      // those values into the React SyntheticEvent reliably. We work
      // around that by dispatching a native DragEvent directly with
      // `bubbles: true` so React's delegated root listener picks it
      // up with the coordinates attached.
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)
      const groupsBefore = container.querySelectorAll(
        '[data-workspace-group]',
      )
      expect(groupsBefore.length).toBe(1)

      // Mock getBoundingClientRect on the group so computeQuadrant
      // sees a real 200×200 rect — jsdom otherwise returns zero-size
      // which makes the defensive path collapse to 'center'.
      const groupEl = groupsBefore[0] as HTMLElement
      groupEl.getBoundingClientRect = () =>
        ({
          x: 0, y: 0, left: 0, top: 0,
          width: 200, height: 200,
          right: 200, bottom: 200,
          toJSON: () => ({}),
        }) as DOMRect

      const dataStore: Record<string, string> = {}
      const dataTransfer = {
        setData: (type: string, value: string) => {
          dataStore[type] = value
        },
        getData: (type: string) => dataStore[type] ?? '',
        types: [] as string[],
        effectAllowed: '',
        dropEffect: '',
      }

      const tabB = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      fireEvent.dragStart(tabB, { dataTransfer })
      dataTransfer.types.push('application/workspace-tab')

      // React Testing Library's `createEvent.drop` builds a proper
      // DragEvent that React's delegated listener recognizes. We patch
      // `clientX`/`clientY` via `defineProperty` because RTL's init
      // dict path doesn't reliably set them, and fireEvent otherwise
      // strips them. Same treatment for dragover.
      const patchCoords = <E extends Event>(ev: E, x: number, y: number): E => {
        Object.defineProperty(ev, 'clientX', { value: x, configurable: true })
        Object.defineProperty(ev, 'clientY', { value: y, configurable: true })
        return ev
      }
      const dragOverEvent = patchCoords(
        createEvent.dragOver(groupEl, { dataTransfer }),
        180,
        100,
      )
      fireEvent(groupEl, dragOverEvent)
      const dropEvent = patchCoords(
        createEvent.drop(groupEl, { dataTransfer }),
        180,
        100,
      )
      fireEvent(groupEl, dropEvent)

      // After the drop we should have TWO groups — the original (with
      // t-a still in it) and a new one (with t-b moved into it).
      const groupsAfter = container.querySelectorAll(
        '[data-workspace-group]',
      )
      expect(groupsAfter.length).toBe(2)

      // t-b should be in a different group than t-a.
      const tbAfter = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      const taAfter = container.querySelector(
        '[data-workspace-tab="t-a"]',
      ) as HTMLElement
      const tbGroup = tbAfter.closest('[data-workspace-group]')
      const taGroup = taAfter.closest('[data-workspace-group]')
      expect(tbGroup).not.toBe(taGroup)
    })

    it('is a no-op when dragging the ONLY tab in a single-tab group to its own quadrant', () => {
      // Degenerate case — splitting a single tab off of its own group
      // would collapse the source and re-home the tab as the only
      // tab of a new group, producing a visually identical state. The
      // drop should be a no-op so the user doesn't see a phantom
      // reorganization.
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(<WorkspaceShell initialTabs={tabs} />)

      const groupEl = container.querySelector(
        '[data-workspace-group]',
      ) as HTMLElement
      groupEl.getBoundingClientRect = () =>
        ({
          x: 0, y: 0, left: 0, top: 0,
          width: 200, height: 200,
          right: 200, bottom: 200,
          toJSON: () => ({}),
        }) as DOMRect

      const dataStore: Record<string, string> = {}
      const dataTransfer = {
        setData: (type: string, value: string) => {
          dataStore[type] = value
        },
        getData: (type: string) => dataStore[type] ?? '',
        types: [] as string[],
        effectAllowed: '',
        dropEffect: '',
      }

      const tabA = container.querySelector(
        '[data-workspace-tab="t-a"]',
      ) as HTMLElement
      fireEvent.dragStart(tabA, { dataTransfer })
      dataTransfer.types.push('application/workspace-tab')

      const patchCoords2 = <E extends Event>(ev: E, x: number, y: number): E => {
        Object.defineProperty(ev, 'clientX', { value: x, configurable: true })
        Object.defineProperty(ev, 'clientY', { value: y, configurable: true })
        return ev
      }
      fireEvent(
        groupEl,
        patchCoords2(
          createEvent.dragOver(groupEl, { dataTransfer }),
          180,
          100,
        ),
      )
      fireEvent(
        groupEl,
        patchCoords2(createEvent.drop(groupEl, { dataTransfer }), 180, 100),
      )

      // Still exactly one group, t-a still in it.
      const groupsAfter = container.querySelectorAll(
        '[data-workspace-group]',
      )
      expect(groupsAfter.length).toBe(1)
    })
  })

  describe('theme (PV6 / P6 guard)', () => {
    it('applies the dark theme to the shell root', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(
        <WorkspaceShell initialTabs={tabs} theme="dark" />,
      )
      const root = container.querySelector(
        '[data-workspace-shell="root"]',
      ) as HTMLElement
      expect(root).not.toBeNull()
      expect(root.style.getPropertyValue('--background')).toBe('#090912')
    })

    it('applies the light theme when requested', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const { container } = render(
        <WorkspaceShell initialTabs={tabs} theme="light" />,
      )
      const root = container.querySelector(
        '[data-workspace-shell="root"]',
      ) as HTMLElement
      expect(root.style.getPropertyValue('--background')).toBe('#f8f7ff')
    })
  })

  describe('onActiveTabChange on group switch', () => {
    it('fires when the user mousedown-clicks into a different group', () => {
      const tabs = [editorTab('t-a', 'f-strudel')]
      const onActiveTabChange = vi.fn()
      const { container } = render(
        <WorkspaceShell
          initialTabs={tabs}
          onActiveTabChange={onActiveTabChange}
        />,
      )
      // Split to get a second group (empty).
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      fireEvent.click(splitBtn)
      onActiveTabChange.mockClear()

      // Click into the empty group's content area.
      const emptyContent = container.querySelector(
        '[data-testid^="group-empty-"]',
      ) as HTMLElement
      // The mousedown listener lives on the group wrapper; bubble up.
      const groupRoot = emptyContent.closest(
        '[data-workspace-group]',
      ) as HTMLElement
      fireEvent.mouseDown(groupRoot)
      // Switching into an empty group means the active tab is null.
      expect(onActiveTabChange).toHaveBeenLastCalledWith(null)
    })
  })

  describe('PV7 acceptance — previewMode is NOT in the shell source', () => {
    it('has zero occurrences of "previewMode" in WorkspaceShell.tsx or types.ts additions', () => {
      // Read the shell source from disk. This is the acceptance test
      // from the task spec: PLAN.md §10.2-04 says `grep -n "previewMode"`
      // on the new file must return zero.
      const shellPath = path.resolve(
        __dirname,
        '..',
        'WorkspaceShell.tsx',
      )
      const shellSrc = fs.readFileSync(shellPath, 'utf8')
      expect(shellSrc).not.toMatch(/previewMode/)
      // Also check the Task 04 type additions. We only scan the
      // "Task 04 — WorkspaceShell" section marker down, so Task 03's
      // types that have nothing to do with previewMode stay out of
      // scope. A simple occurrence check suffices since types.ts has
      // never mentioned previewMode in any section.
      const typesPath = path.resolve(__dirname, '..', 'types.ts')
      const typesSrc = fs.readFileSync(typesPath, 'utf8')
      expect(typesSrc).not.toMatch(/previewMode/)
    })
  })

  describe('switching active groups updates the resolved active tab', () => {
    it('reports the right tab when user drags across groups', () => {
      const tabs = [
        editorTab('t-a', 'f-strudel'),
        editorTab('t-b', 'f-hydra'),
      ]
      const onActiveTabChange = vi.fn()
      const { container } = render(
        <WorkspaceShell
          initialTabs={tabs}
          onActiveTabChange={onActiveTabChange}
        />,
      )
      onActiveTabChange.mockClear()

      // Split and move t-b across.
      const splitBtn = container.querySelector(
        '[data-testid^="group-split-"]',
      ) as HTMLElement
      fireEvent.click(splitBtn)
      const groupEls = container.querySelectorAll(
        '[data-workspace-group]',
      ) as NodeListOf<HTMLElement>

      const dataStore: Record<string, string> = {}
      const dataTransfer = {
        setData: (type: string, value: string) => {
          dataStore[type] = value
        },
        getData: (type: string) => dataStore[type] ?? '',
        types: [] as string[],
        effectAllowed: '',
        dropEffect: '',
      }

      const tabB = container.querySelector(
        '[data-workspace-tab="t-b"]',
      ) as HTMLElement
      fireEvent.dragStart(tabB, { dataTransfer })
      dataTransfer.types.push('application/workspace-tab')
      fireEvent.dragOver(groupEls[1], { dataTransfer })
      fireEvent.drop(groupEls[1], { dataTransfer })

      // After the drop, the active tab is t-b (in the target group).
      expect(onActiveTabChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 't-b' }),
      )
    })
  })

  // Silence the unused imports that some branches above don't reach
  // in every test. `act` is imported for future timing tests; kept
  // here to keep the import list stable across plan tasks.
  it('act import stays stable', () => {
    expect(typeof act).toBe('function')
  })
})
