/**
 * AddEffectMenu — the "＋ More" popover over the full effect catalog (#575).
 *
 * Sits next to the favorite buttons. Opens a grouped, searchable list of every
 * effect in `effectCatalog`; each row is a toggle (✓ when present), so the menu
 * is the unified add *and* remove surface for the long tail. No document state —
 * `present` (the chain's method names) drives the ✓, `onToggle` does the write.
 */
import * as React from 'react'

import { EFFECT_GROUPS, isEffectActive, type Effect } from './effectCatalog'

export function AddEffectMenu({
  present,
  onToggle,
}: {
  /** method names currently in the chain (drives the ✓ state, alias-aware) */
  present: ReadonlySet<string>
  /** add the effect if absent, remove it if present */
  onToggle: (e: Effect) => void
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  // Close on outside click or Escape (a standard popover; no portal needed —
  // the drawer clips, so the menu is positioned to open below the button).
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const groups = EFFECT_GROUPS.map(
    ([group, effects]) =>
      [
        group,
        q
          ? effects.filter(
              (e) => e.label.toLowerCase().includes(q) || e.method.toLowerCase().includes(q),
            )
          : effects,
      ] as const,
  ).filter(([, effects]) => effects.length > 0)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        data-mixer-add-effect
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Add effect"
        style={{
          padding: '3px 10px',
          fontSize: 11,
          borderRadius: 4,
          cursor: 'pointer',
          border: '1px solid var(--border, #3a3a42)',
          background: 'var(--background-elevated, #26262c)',
          color: 'var(--foreground, #e6e6ea)',
        }}
      >
        ＋ More ▾
      </button>
      {open && (
        <div
          data-mixer-add-effect-menu
          style={{
            position: 'absolute',
            zIndex: 30,
            top: '100%',
            left: 0,
            marginTop: 4,
            width: 230,
            maxHeight: 300,
            overflowY: 'auto',
            padding: 6,
            borderRadius: 6,
            border: '1px solid var(--border, #3a3a42)',
            background: 'var(--background-elevated, #26262c)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
          }}
        >
          <input
            autoFocus
            data-mixer-add-effect-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search effects…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '4px 8px',
              marginBottom: 4,
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--border, #3a3a42)',
              background: 'var(--background, #1c1c20)',
              color: 'var(--foreground, #e6e6ea)',
            }}
          />
          {groups.map(([group, effects]) => (
            <div key={group}>
              <div
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: 'var(--foreground-muted, #6a6a72)',
                  margin: '6px 4px 2px',
                }}
              >
                {group}
              </div>
              {effects.map((e) => {
                const active = isEffectActive(present, e)
                return (
                  <button
                    key={e.method}
                    type="button"
                    data-mixer-add-effect-item={e.method}
                    aria-pressed={active}
                    onClick={() => onToggle(e)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 6px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                      background: active ? 'var(--background, #1c1c20)' : 'transparent',
                      color: 'var(--foreground, #e6e6ea)',
                    }}
                  >
                    <span style={{ width: 12, color: 'var(--accent, #6ea8fe)' }}>
                      {active ? '✓' : ''}
                    </span>
                    {e.label}
                  </button>
                )
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <div style={{ padding: 8, fontSize: 11, color: 'var(--foreground-muted, #a0a0aa)' }}>
              No effects match “{query}”.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
