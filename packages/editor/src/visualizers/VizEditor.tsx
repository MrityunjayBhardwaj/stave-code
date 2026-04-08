import React, { useCallback, useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizDescriptor } from './types'
import type { VizPreset } from './vizPreset'
import { VizPresetStore, generateUniquePresetId } from './vizPreset'
import { compilePreset } from './vizCompiler'
import { VizPanel } from './VizPanel'
import type { HapStream } from '../engine/HapStream'
import type { PatternScheduler } from './types'
import { SplitPane } from './editor/SplitPane'
import { EditorGroup } from './editor/EditorGroup'
import { usePopoutPreview } from './editor/PopoutPreview'
import { applyTheme } from '../theme/tokens'
import type { StrudelTheme } from '../theme/tokens'
import type {
  VizTab, PreviewMode, EditorGroupState, DragPayload,
} from './editor/vizEditorTypes'
import {
  presetToTab, HYDRA_TEMPLATE, P5_TEMPLATE,
} from './editor/vizEditorTypes'

// ---------------------------------------------------------------------------
// Language registration (shared across all Monaco instances)
// ---------------------------------------------------------------------------

let hydraLangRegistered = false
function registerHydraLanguage(monaco: typeof Monaco): void {
  if (hydraLangRegistered) return
  hydraLangRegistered = true
  monaco.languages.register({ id: 'hydra' })
  monaco.languages.setMonarchTokensProvider('hydra', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/\b(osc|noise|shape|gradient|solid|voronoi|src|s0|s1|s2|s3|o0|o1|o2|o3)\b/, 'keyword'],
        [/\.(color|rotate|scale|modulate|blend|add|diff|layer|mask|luma|thresh|posterize|shift|kaleid|scroll|scrollX|scrollY|pixelate|repeat|repeatX|repeatY|out|brightness|contrast|saturate|hue|invert)\b/, 'type'],
        [/\b(Math|PI|sin|cos|tan|abs|floor|ceil|round|max|min|random|pow|sqrt)\b/, 'variable'],
        [/\ba\b/, 'variable.predefined'],
        [/\b\d+\.?\d*\b/, 'number'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/=>/, 'keyword.operator'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  })
}

let p5LangRegistered = false
function registerP5Language(monaco: typeof Monaco): void {
  if (p5LangRegistered) return
  p5LangRegistered = true
  monaco.languages.register({ id: 'p5js' })
  monaco.languages.setMonarchTokensProvider('p5js', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/\b(background|fill|stroke|noFill|noStroke|rect|ellipse|line|point|arc|triangle|quad|beginShape|endShape|vertex|text|textSize|textAlign|image|loadImage|createCanvas|resizeCanvas|push|pop|translate|rotate|scale)\b/, 'keyword'],
        [/\b(width|height|mouseX|mouseY|frameCount|millis|hapStream|analyser|scheduler)\b/, 'variable.predefined'],
        [/\b(let|const|var|function|for|while|if|else|return|class|new|typeof|of|in)\b/, 'keyword'],
        [/\b\d+\.?\d*\b/, 'number'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/`[^`]*`/, 'string'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  })
}

// ---------------------------------------------------------------------------
// VizEditor — Full multi-group editor
// ---------------------------------------------------------------------------

export interface VizEditorProps {
  components: Partial<EngineComponents>
  hapStream: HapStream | null
  analyser: AnalyserNode | null
  scheduler: PatternScheduler | null
  onPresetSaved?: (preset: VizPreset) => void
  height?: number | string
  previewHeight?: number | string
  /** Theme applied to the container — defaults to 'dark'. */
  theme?: 'dark' | 'light' | StrudelTheme
}

let groupCounter = 0
function nextGroupId(): string {
  return `grp-${++groupCounter}`
}

export function VizEditor({
  components,
  hapStream,
  analyser,
  scheduler,
  onPresetSaved,
  height = 400,
  previewHeight = 200,
  theme = 'dark',
}: VizEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) applyTheme(containerRef.current, theme)
  }, [theme])

  // ── State ──────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<EditorGroupState[]>([
    { id: nextGroupId(), tabs: [], activeTabId: null, previewMode: 'panel' },
  ])
  const [splitDirection, setSplitDirection] = useState<'horizontal' | 'vertical'>('horizontal')
  const [previewDescriptors, setPreviewDescriptors] = useState<Map<string, VizDescriptor>>(new Map())
  const [previewErrors, setPreviewErrors] = useState<Map<string, string>>(new Map())
  const [popoutGroupId, setPopoutGroupId] = useState<string | null>(null)

  // DnD state
  const dragPayloadRef = useRef<DragPayload | null>(null)

  // Monaco instances per group
  const editorsRef = useRef<Map<string, Monaco.editor.IStandaloneCodeEditor>>(new Map())
  const monacoRef = useRef<typeof Monaco | null>(null)

  // Debounce timers per group
  const debounceRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // ── Load presets from IndexedDB ────────────────────────────────────────
  useEffect(() => {
    VizPresetStore.getAll().then(presets => {
      if (presets.length > 0) {
        const loadedTabs = presets.map(p => presetToTab(p))
        setGroups([{
          id: groups[0].id,
          tabs: loadedTabs,
          activeTabId: loadedTabs[0].id,
          previewMode: 'panel',
        }])
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hot reload ─────────────────────────────────────────────────────────
  const triggerHotReload = useCallback((groupId: string, preset: VizPreset) => {
    const existing = debounceRefs.current.get(groupId)
    if (existing) clearTimeout(existing)

    debounceRefs.current.set(groupId, setTimeout(() => {
      try {
        const descriptor = compilePreset(preset)
        setPreviewDescriptors(prev => new Map(prev).set(groupId, descriptor))
        setPreviewErrors(prev => {
          const next = new Map(prev)
          next.delete(groupId)
          return next
        })
      } catch (e) {
        setPreviewErrors(prev => new Map(prev).set(groupId, (e as Error).message))
      }
    }, 300))
  }, [])

  // Trigger hot reload when active tab changes in any group
  useEffect(() => {
    for (const group of groups) {
      const activeTab = group.tabs.find(t => t.id === group.activeTabId)
      if (activeTab) {
        triggerHotReload(group.id, activeTab.preset)
      }
    }
    return () => {
      debounceRefs.current.forEach(t => clearTimeout(t))
    }
  }, [groups.map(g => g.activeTabId).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab operations ─────────────────────────────────────────────────────
  const handleTabClick = useCallback((groupId: string, tabId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, activeTabId: tabId } : g
    ))
  }, [])

  const handleTabClose = useCallback((groupId: string, tabId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const next = g.tabs.filter(t => t.id !== tabId)
      return {
        ...g,
        tabs: next,
        activeTabId: g.activeTabId === tabId ? (next[0]?.id ?? null) : g.activeTabId,
      }
    }))
  }, [])

  const handleCodeChange = useCallback((groupId: string, tabId: string, code: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        tabs: g.tabs.map(t => {
          if (t.id !== tabId) return t
          const updatedPreset = { ...t.preset, code, updatedAt: Date.now() }
          triggerHotReload(groupId, updatedPreset)
          return { ...t, preset: updatedPreset, dirty: true }
        }),
      }
    }))
  }, [triggerHotReload])

  const handleMonacoMount = useCallback((
    groupId: string,
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    editorsRef.current.set(groupId, editor)
    monacoRef.current = monaco
    registerHydraLanguage(monaco)
    registerP5Language(monaco)

    // Ctrl+S saves the active tab's preset
    editor.addAction({
      id: 'vizEditor.save',
      label: 'Save Viz Preset',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => handleSave(groupId),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewViz = useCallback(async (renderer: 'hydra' | 'p5', targetGroupId?: string) => {
    // Collect ALL known ids — both persisted (in IndexedDB) and currently
    // open across any editor group — so we never collide.
    const stored = await VizPresetStore.getAll()
    const openIds = groups.flatMap(g => g.tabs.map(t => t.id))
    const allIds = [...stored.map(p => p.id), ...openIds]

    const name = 'untitled'
    const id = generateUniquePresetId(name, renderer, allIds)
    const now = Date.now()
    const preset: VizPreset = {
      id,
      name,
      renderer,
      code: renderer === 'hydra' ? HYDRA_TEMPLATE : P5_TEMPLATE,
      requires: renderer === 'hydra' ? ['audio'] : ['streaming'],
      createdAt: now,
      updatedAt: now,
    }
    const tab = presetToTab(preset)
    tab.dirty = true

    const gid = targetGroupId ?? groups[0]?.id
    if (!gid) return

    setGroups(prev => prev.map(g =>
      g.id === gid
        ? { ...g, tabs: [...g.tabs, tab], activeTabId: id }
        : g
    ))
  }, [groups])

  const handleSave = useCallback(async (groupId: string) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const activeTab = group.tabs.find(t => t.id === group.activeTabId)
    if (!activeTab) return

    const preset = activeTab.preset
    await VizPresetStore.put(preset)

    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        tabs: g.tabs.map(t =>
          t.id === preset.id ? { ...t, dirty: false } : t
        ),
      }
    }))
    onPresetSaved?.(preset)
  }, [groups, onPresetSaved])

  // ── Split / Close group ────────────────────────────────────────────────
  const handleSplit = useCallback((groupId: string, direction: 'horizontal' | 'vertical') => {
    setSplitDirection(direction)
    const newGroup: EditorGroupState = {
      id: nextGroupId(),
      tabs: [],
      activeTabId: null,
      previewMode: 'panel',
    }
    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === groupId)
      const next = [...prev]
      next.splice(idx + 1, 0, newGroup)
      return next
    })
  }, [])

  const handleCloseGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      if (prev.length <= 1) return prev // don't close last group
      const closing = prev.find(g => g.id === groupId)
      const remaining = prev.filter(g => g.id !== groupId)
      // Move orphaned tabs to first remaining group
      if (closing && closing.tabs.length > 0) {
        remaining[0] = {
          ...remaining[0],
          tabs: [...remaining[0].tabs, ...closing.tabs],
        }
      }
      return remaining
    })
    editorsRef.current.delete(groupId)
  }, [])

  const handlePreviewModeChange = useCallback((groupId: string, mode: PreviewMode) => {
    if (mode === 'popout') {
      setPopoutGroupId(groupId)
    }
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, previewMode: mode } : g
    ))
  }, [])

  // ── Rename ─────────────────────────────────────────────────────────────
  const handleRename = useCallback((groupId: string, tabId: string, newName: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return {
        ...g,
        tabs: g.tabs.map(t => {
          if (t.id !== tabId) return t
          return {
            ...t,
            label: `${newName}.${t.preset.renderer}`,
            preset: { ...t.preset, name: newName, updatedAt: Date.now() },
            dirty: true,
          }
        }),
      }
    }))
  }, [])

  // ── Tab drag and drop ──────────────────────────────────────────────────
  const handleTabDragStart = useCallback((groupId: string, tabId: string) => {
    dragPayloadRef.current = { sourceGroupId: groupId, tabId }
  }, [])

  const handleTabDrop = useCallback((targetGroupId: string) => {
    const payload = dragPayloadRef.current
    if (!payload) return
    dragPayloadRef.current = null

    const { sourceGroupId, tabId } = payload
    if (sourceGroupId === targetGroupId) return // dropped on same group

    setGroups(prev => {
      // Find the tab in the source group
      const sourceGroup = prev.find(g => g.id === sourceGroupId)
      if (!sourceGroup) return prev
      const tab = sourceGroup.tabs.find(t => t.id === tabId)
      if (!tab) return prev

      return prev.map(g => {
        if (g.id === sourceGroupId) {
          // Remove from source
          const remainingTabs = g.tabs.filter(t => t.id !== tabId)
          return {
            ...g,
            tabs: remainingTabs,
            activeTabId: g.activeTabId === tabId
              ? (remainingTabs[0]?.id ?? null)
              : g.activeTabId,
          }
        }
        if (g.id === targetGroupId) {
          // Add to target
          return {
            ...g,
            tabs: [...g.tabs, tab],
            activeTabId: tabId,
          }
        }
        return g
      })
    })
  }, [])

  // ── Popout preview ─────────────────────────────────────────────────────
  const popoutGroup = popoutGroupId ? groups.find(g => g.id === popoutGroupId) : null
  const popoutDescriptor = popoutGroupId ? previewDescriptors.get(popoutGroupId) ?? null : null

  const { cleanup: cleanupPopout } = usePopoutPreview({
    descriptor: popoutDescriptor,
    hapStream,
    analyser,
    scheduler,
    onClose: () => {
      if (popoutGroupId) {
        setGroups(prev => prev.map(g =>
          g.id === popoutGroupId ? { ...g, previewMode: 'panel' } : g
        ))
      }
      setPopoutGroupId(null)
    },
  })

  // Cleanup popout on unmount
  useEffect(() => () => cleanupPopout(), [cleanupPopout])

  // ── Build preview nodes for each group ─────────────────────────────────
  const buildPreviewNode = (groupId: string): React.ReactNode | null => {
    const descriptor = previewDescriptors.get(groupId)
    const error = previewErrors.get(groupId)

    if (error) {
      return (
        <div style={{ padding: 12, color: '#ff6b6b', fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )
    }

    if (!descriptor) return null

    return (
      <VizPanel
        key={descriptor.id + '-' + groupId}
        vizHeight={previewHeight}
        hapStream={hapStream}
        analyser={analyser}
        scheduler={scheduler}
        source={descriptor.factory}
      />
    )
  }

  // ── Toolbar ────────────────────────────────────────────────────────────
  // Find the globally active group (first one with an active tab)
  const activeGroup = groups.find(g => g.activeTabId !== null) ?? groups[0]
  const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId)

  return (
    <div
      ref={containerRef}
      data-testid="viz-editor"
      data-stave-theme={typeof theme === 'string' ? theme : 'custom'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background)',
        color: 'var(--foreground)',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        width: '100%',
        height: typeof height === 'number' ? height + 40 : height,
      }}
    >
      {/* Global toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            onClick={() => handleNewViz('hydra', activeGroup?.id)}
            title="New Hydra viz"
            style={toolbarBtnStyle}
          >
            + hydra
          </button>
          <button
            onClick={() => handleNewViz('p5', activeGroup?.id)}
            title="New p5 viz"
            style={toolbarBtnStyle}
          >
            + p5
          </button>
        </div>

        {activeTab && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
            <input
              value={activeTab.preset.name}
              onChange={e => {
                if (activeGroup) {
                  handleRename(activeGroup.id, activeTab.id, e.target.value)
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: 'var(--foreground)',
                padding: '2px 6px',
                fontSize: 11,
                fontFamily: 'inherit',
                width: 110,
              }}
            />
            <span style={{ color: 'var(--foreground-muted)', fontSize: 10 }}>
              {activeTab.preset.renderer}
            </span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {activeTab && (
          <button
            onClick={() => activeGroup && handleSave(activeGroup.id)}
            disabled={!activeTab.dirty}
            style={{
              ...toolbarBtnStyle,
              background: activeTab.dirty ? 'rgba(117,186,255,0.15)' : 'transparent',
              color: activeTab.dirty ? '#75baff' : 'var(--foreground-muted)',
              opacity: activeTab.dirty ? 1 : 0.5,
            }}
          >
            {'\u2318'}S Save
          </button>
        )}
      </div>

      {/* Split pane layout with N editor groups */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {groups.length === 1 ? (
          <EditorGroup
            groupId={groups[0].id}
            tabs={groups[0].tabs}
            activeTabId={groups[0].activeTabId}
            previewMode={groups[0].previewMode}
            previewNode={buildPreviewNode(groups[0].id)}
            height={height}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onCodeChange={handleCodeChange}
            onMonacoMount={handleMonacoMount}
            onSplit={handleSplit}
            onCloseGroup={handleCloseGroup}
            onPreviewModeChange={handlePreviewModeChange}
            onTabDragStart={handleTabDragStart}
            onTabDrop={handleTabDrop}
            canClose={false}
          />
        ) : (
          <SplitPane direction={splitDirection} minSize={150}>
            {groups.map(group => (
              <EditorGroup
                key={group.id}
                groupId={group.id}
                tabs={group.tabs}
                activeTabId={group.activeTabId}
                previewMode={group.previewMode}
                previewNode={buildPreviewNode(group.id)}
                height={height}
                onTabClick={handleTabClick}
                onTabClose={handleTabClose}
                onCodeChange={handleCodeChange}
                onMonacoMount={handleMonacoMount}
                onSplit={handleSplit}
                onCloseGroup={handleCloseGroup}
                onPreviewModeChange={handlePreviewModeChange}
                onTabDragStart={handleTabDragStart}
                onTabDrop={handleTabDrop}
                canClose={groups.length > 1}
              />
            ))}
          </SplitPane>
        )}
      </div>
    </div>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--foreground-muted)',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 10,
  fontFamily: 'inherit',
}
