import React, { useCallback, useRef, useState } from 'react'

interface SplitPaneProps {
  direction: 'horizontal' | 'vertical'
  children: React.ReactNode[]
  /** Initial sizes as percentages (must sum to 100). Defaults to equal splits. */
  initialSizes?: number[]
  /** Minimum size in pixels for each pane. */
  minSize?: number
}

/**
 * Zero-dependency resizable split pane. Supports N children with
 * draggable dividers between each pair.
 */
export function SplitPane({
  direction,
  children,
  initialSizes,
  minSize = 100,
}: SplitPaneProps) {
  const count = React.Children.count(children)
  const childArray = React.Children.toArray(children)
  const defaultSizes = initialSizes ?? Array(count).fill(100 / count)
  const [sizes, setSizes] = useState<number[]>(defaultSizes)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<number | null>(null)

  const isHorizontal = direction === 'horizontal'

  const handleMouseDown = useCallback((dividerIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = dividerIndex
    const startPos = isHorizontal ? e.clientX : e.clientY
    const startSizes = [...sizes]

    const container = containerRef.current
    if (!container) return
    const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight
    const minPct = (minSize / containerSize) * 100

    const onMouseMove = (ev: MouseEvent) => {
      if (draggingRef.current === null) return
      const delta = isHorizontal ? ev.clientX - startPos : ev.clientY - startPos
      const deltaPct = (delta / containerSize) * 100

      const newSizes = [...startSizes]
      const i = dividerIndex
      newSizes[i] = Math.max(minPct, startSizes[i] + deltaPct)
      newSizes[i + 1] = Math.max(minPct, startSizes[i + 1] - deltaPct)

      // Clamp: if either hit min, adjust
      if (newSizes[i] < minPct) {
        newSizes[i] = minPct
        newSizes[i + 1] = startSizes[i] + startSizes[i + 1] - minPct
      }
      if (newSizes[i + 1] < minPct) {
        newSizes[i + 1] = minPct
        newSizes[i] = startSizes[i] + startSizes[i + 1] - minPct
      }

      setSizes(newSizes)
    }

    const onMouseUp = () => {
      draggingRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sizes, isHorizontal, minSize])

  // Sync sizes when child count changes
  React.useEffect(() => {
    if (sizes.length !== count) {
      setSizes(Array(count).fill(100 / count))
    }
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {childArray.map((child, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              [isHorizontal ? 'width' : 'height']: `${sizes[i]}%`,
              [isHorizontal ? 'height' : 'width']: '100%',
              overflow: 'hidden',
              position: 'relative',
              minWidth: isHorizontal ? minSize : undefined,
              minHeight: !isHorizontal ? minSize : undefined,
            }}
          >
            {child}
          </div>
          {i < childArray.length - 1 && (
            <div
              onMouseDown={(e) => handleMouseDown(i, e)}
              style={{
                [isHorizontal ? 'width' : 'height']: 4,
                [isHorizontal ? 'height' : 'width']: '100%',
                background: 'var(--border, rgba(255,255,255,0.1))',
                cursor: isHorizontal ? 'col-resize' : 'row-resize',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  'var(--accent, #75baff)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  'var(--border, rgba(255,255,255,0.1))'
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
