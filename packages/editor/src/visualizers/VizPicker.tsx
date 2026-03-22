import React from 'react'
import type { VizDescriptor } from './types'

interface VizPickerProps {
  descriptors: VizDescriptor[]
  activeId: string
  onIdChange: (id: string) => void
  showVizPicker?: boolean
}

function PianorollIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="5" height="2" rx="0.5" />
      <rect x="4" y="7" width="6" height="2" rx="0.5" />
      <rect x="2" y="11" width="4" height="2" rx="0.5" />
    </svg>
  )
}

function ScopeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 7 Q3.5 2 7 7 Q10.5 12 13 7" />
    </svg>
  )
}

function SpectrumIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="12" x2="2" y2="6" /><line x1="5" y1="12" x2="5" y2="3" />
      <line x1="8" y1="12" x2="8" y2="5" /><line x1="11" y1="12" x2="11" y2="8" />
    </svg>
  )
}

function SpiralIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 7 Q7 4 9 4 Q12 4 12 7 Q12 11 7 11 Q2 11 2 7 Q2 2 7 2" />
    </svg>
  )
}

function PitchwheelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="5" />
      <circle cx="7" cy="3" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FscopeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="1" y1="10" x2="1" y2="7" /><line x1="3" y1="10" x2="3" y2="5" />
      <line x1="5" y1="10" x2="5" y2="4" /><line x1="7" y1="10" x2="7" y2="3" />
      <line x1="9" y1="10" x2="9" y2="5" /><line x1="11" y1="10" x2="11" y2="7" />
      <line x1="13" y1="10" x2="13" y2="9" />
    </svg>
  )
}

function WordfallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="3" height="4" rx="0.5" />
      <rect x="6" y="5" width="3" height="4" rx="0.5" />
      <rect x="10" y="1" width="3" height="3" rx="0.5" />
    </svg>
  )
}

/** Private icon lookup — keeps VizDescriptor lean (no React-specific fields). */
const ICON_MAP: Record<string, React.ReactNode> = {
  pianoroll:  <PianorollIcon />,
  wordfall:   <WordfallIcon />,
  scope:      <ScopeIcon />,
  fscope:     <FscopeIcon />,
  spectrum:   <SpectrumIcon />,
  spiral:     <SpiralIcon />,
  pitchwheel: <PitchwheelIcon />,
}

export function VizPicker({ descriptors, activeId, onIdChange, showVizPicker = true }: VizPickerProps) {
  if (!showVizPicker) return null

  return (
    <div
      data-testid="viz-picker"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 32,
        padding: '0 8px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {descriptors.map((descriptor) => {
        const isActive = descriptor.id === activeId
        return (
          <button
            key={descriptor.id}
            data-testid={`viz-btn-${descriptor.id}`}
            data-active={isActive ? 'true' : undefined}
            title={descriptor.label}
            onClick={() => onIdChange(descriptor.id)}
            style={{
              width: 32,
              height: 24,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              outline: isActive ? '1px solid var(--accent)' : 'none',
              color: isActive ? 'var(--foreground)' : 'var(--foreground-muted)',
              padding: 0,
            }}
          >
            {ICON_MAP[descriptor.id] ?? descriptor.label.charAt(0)}
          </button>
        )
      })}
    </div>
  )
}
