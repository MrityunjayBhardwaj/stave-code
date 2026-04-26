import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function Bomb({ when }: { when: boolean }): React.ReactElement {
  if (when) throw new Error('kaboom')
  return <div data-testid="ok">ok</div>
}

describe('ErrorBoundary', () => {
  // Silence the expected React error log during these tests.
  const origError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = origError
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <Bomb when={false} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('ok')).toBeTruthy()
  })

  it('renders default fallback when child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb when={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/editor crashed/i)).toBeTruthy()
    expect(screen.getByText('kaboom')).toBeTruthy()
  })

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={(err) => <div data-testid="custom">{err.message}</div>}>
        <Bomb when={true} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('custom').textContent).toBe('kaboom')
  })

  it('calls onError with the error', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <Bomb when={true} />
      </ErrorBoundary>
    )
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('resets when resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Bomb when={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/editor crashed/i)).toBeTruthy()

    rerender(
      <ErrorBoundary resetKey="b">
        <Bomb when={false} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('ok')).toBeTruthy()
  })

  it('retry button clears the error and re-renders children', () => {
    let shouldThrow = true
    const Child = (): React.ReactElement => {
      if (shouldThrow) throw new Error('first')
      return <div data-testid="recovered">recovered</div>
    }
    render(
      <ErrorBoundary>
        <Child />
      </ErrorBoundary>
    )
    expect(screen.getByText(/editor crashed/i)).toBeTruthy()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByTestId('recovered')).toBeTruthy()
  })
})
