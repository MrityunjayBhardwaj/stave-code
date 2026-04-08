import React, { useState, useRef, useEffect } from 'react'
import type { EngineComponents } from '../engine/LiveCodingEngine'
import type { VizDescriptor } from './types'

interface VizDropdownProps {
  descriptors: VizDescriptor[]
  activeId: string
  onIdChange: (id: string) => void
  onNewViz?: () => void
  availableComponents?: (keyof EngineComponents)[]
}

/**
 * Grouped dropdown picker for viz modes — replaces the icon button bar.
 * Groups descriptors by renderer field. Custom presets marked with ★.
 */
export function VizDropdown({
  descriptors,
  activeId,
  onIdChange,
  onNewViz,
  availableComponents,
}: VizDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeDescriptor = descriptors.find(d => d.id === activeId)
  const activeLabel = activeDescriptor?.label ?? activeId

  // Group by renderer
  const groups = new Map<string, VizDescriptor[]>()
  for (const d of descriptors) {
    const key = d.renderer ?? 'other'
    const arr = groups.get(key) ?? []
    arr.push(d)
    groups.set(key, arr)
  }

  const isEnabled = (d: VizDescriptor): boolean => {
    if (!availableComponents || !d.requires?.length) return true
    return d.requires.every(req => availableComponents.includes(req))
  }

  // Known built-in IDs — anything not in this set is a custom preset
  const builtinIds = new Set([
    'pianoroll', 'wordfall', 'scope', 'fscope', 'spectrum', 'spiral', 'pitchwheel',
    'hydra', 'pianoroll:hydra', 'scope:hydra', 'kaleidoscope:hydra',
  ])

  return (
    <div
      ref={ref}
      data-testid="viz-dropdown"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 32,
        padding: '0 8px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--foreground-muted)', fontSize: 11, marginRight: 2 }}>
        Viz:
      </span>
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--foreground)',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 12,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 120,
          justifyContent: 'space-between',
        }}
      >
        <span>{activeLabel}</span>
        <span style={{ fontSize: 8, opacity: 0.6 }}>{'\u25BC'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 8,
            zIndex: 100,
            background: 'var(--surface, #1a1a2e)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: 200,
            maxHeight: 320,
            overflow: 'auto',
            padding: '4px 0',
          }}
        >
          {[...groups.entries()].map(([renderer, items]) => (
            <div key={renderer}>
              <div
                style={{
                  padding: '4px 12px 2px',
                  fontSize: 10,
                  color: 'var(--foreground-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  borderTop: '1px solid var(--border)',
                  marginTop: 2,
                }}
              >
                {renderer}
              </div>
              {items.map(d => {
                const enabled = isEnabled(d)
                const isCustom = !builtinIds.has(d.id)
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      if (enabled) {
                        onIdChange(d.id)
                        setOpen(false)
                      }
                    }}
                    disabled={!enabled}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '5px 12px',
                      border: 'none',
                      background: d.id === activeId ? 'rgba(117,186,255,0.12)' : 'transparent',
                      color: enabled ? 'var(--foreground)' : 'var(--foreground-muted)',
                      opacity: enabled ? 1 : 0.4,
                      cursor: enabled ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span>{d.label}</span>
                    {isCustom && <span style={{ color: '#FFCA28', fontSize: 10 }}>{'\u2605'}</span>}
                  </button>
                )
              })}
            </div>
          ))}
          {onNewViz && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
              <button
                onClick={() => {
                  onNewViz()
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '5px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent, #75baff)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                + New Viz...
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
