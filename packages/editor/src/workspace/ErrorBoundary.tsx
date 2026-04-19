import React from 'react'

export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  onError?: (error: Error, info: React.ErrorInfo) => void
  /**
   * When this key changes, the boundary resets. Use the tab id so
   * switching tabs (or reloading a file) clears a prior crash state.
   */
  resetKey?: string | number
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Narrow React error boundary. Wraps editor/preview subtrees so a throw
 * inside Monaco (e.g. `Illegal value for lineNumber` from a bad stack
 * trace — hetvabhasa P37) tears down only the crashing pane, not the
 * surrounding shell (status bar, activity bar, Console panel).
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[stave] editor subtree crashed:', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div
        data-stave-error-boundary
        style={{
          padding: 16,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--foreground-muted, #999)',
          background: 'var(--background-subtle, transparent)',
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'auto',
        }}
      >
        <div style={{ color: 'var(--error, #f48771)', marginBottom: 8 }}>
          Editor crashed
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error.message}</pre>
        <button
          type="button"
          onClick={this.reset}
          style={{
            marginTop: 12,
            padding: '4px 10px',
            background: 'transparent',
            color: 'inherit',
            border: '1px solid currentColor',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }
}
