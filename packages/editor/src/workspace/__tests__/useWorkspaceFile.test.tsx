/**
 * useWorkspaceFile hook — unit tests (Phase 10.2 Task 01).
 *
 * Covers the React-visible behavior of the hook:
 * - mounts and reads initial snapshot via getSnapshot
 * - returns undefined for an unregistered id (pre-seed case)
 * - re-renders when setContent is called for its own id
 * - does NOT re-render when setContent is called for a different id
 *   (the load-bearing isolation guarantee)
 * - setContent callback is bound to the hook's id
 * - snapshot is reference-stable across unrelated notifications
 *   (useSyncExternalStore tearing guard)
 * - store cleanup: createWorkspaceFile after mount updates the consumer
 */

import { describe, it, expect, beforeEach } from 'vitest'
import React, { useRef } from 'react'
import { render, act } from '@testing-library/react'
import { useWorkspaceFile } from '../useWorkspaceFile'
import {
  createWorkspaceFile,
  setContent,
  __resetWorkspaceFilesForTests,
} from '../WorkspaceFile'

/**
 * Small probe component that renders the current content of a file id and
 * increments a render-count ref on every render. Exposes the count via a
 * data attribute so tests read it without leaking into component state.
 */
function Probe({
  id,
  counter,
}: {
  id: string
  counter: { count: number }
}) {
  const { file } = useWorkspaceFile(id)
  counter.count++
  return (
    <div data-testid={`probe-${id}`} data-content={file?.content ?? ''}>
      {file?.content ?? '<empty>'}
    </div>
  )
}

describe('useWorkspaceFile', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
  })

  it('returns the initial snapshot on mount', () => {
    createWorkspaceFile('a', 'a.strudel', 'hello', 'strudel')
    const counter = { count: 0 }
    const { getByTestId } = render(<Probe id="a" counter={counter} />)
    expect(getByTestId('probe-a').getAttribute('data-content')).toBe('hello')
  })

  it('returns undefined when the id is not registered', () => {
    const counter = { count: 0 }
    const { getByTestId } = render(<Probe id="ghost" counter={counter} />)
    expect(getByTestId('probe-ghost').getAttribute('data-content')).toBe('')
  })

  it('re-renders when setContent is called for its own id', () => {
    createWorkspaceFile('a', 'a.strudel', 'v1', 'strudel')
    const counter = { count: 0 }
    const { getByTestId } = render(<Probe id="a" counter={counter} />)
    const initialRenders = counter.count
    act(() => {
      setContent('a', 'v2')
    })
    expect(getByTestId('probe-a').getAttribute('data-content')).toBe('v2')
    expect(counter.count).toBeGreaterThan(initialRenders)
  })

  it('does NOT re-render when setContent is called for a different id', () => {
    createWorkspaceFile('a', 'a.strudel', 'a-content', 'strudel')
    createWorkspaceFile('b', 'b.strudel', 'b-content', 'strudel')
    const aCounter = { count: 0 }
    const bCounter = { count: 0 }

    // Render two sibling probes that subscribe to 'a' and 'b' respectively.
    render(
      <>
        <Probe id="a" counter={aCounter} />
        <Probe id="b" counter={bCounter} />
      </>,
    )
    const aBefore = aCounter.count
    const bBefore = bCounter.count

    act(() => {
      setContent('a', 'a-content-2')
    })

    // 'a' must have re-rendered, 'b' must not.
    expect(aCounter.count).toBeGreaterThan(aBefore)
    expect(bCounter.count).toBe(bBefore)
  })

  it('setContent callback from the hook targets the hook\u2019s own id', () => {
    createWorkspaceFile('a', 'a.strudel', 'initial', 'strudel')

    let writeHandle: ((s: string) => void) | null = null
    function Writer() {
      const { setContent: write } = useWorkspaceFile('a')
      writeHandle = write
      return null
    }

    render(<Writer />)
    act(() => {
      writeHandle?.('typed')
    })

    const probeCounter = { count: 0 }
    const { getByTestId } = render(<Probe id="a" counter={probeCounter} />)
    expect(getByTestId('probe-a').getAttribute('data-content')).toBe('typed')
  })

  it('snapshot reference is stable across unrelated notifications', () => {
    // useSyncExternalStore throws "getSnapshot should be cached" if the
    // same store state returns different references. A regression here
    // would manifest as a React warning or infinite loop in strict mode.
    createWorkspaceFile('a', 'a.strudel', 'a1', 'strudel')
    createWorkspaceFile('b', 'b.strudel', 'b1', 'strudel')

    const seenRefs: Array<unknown> = []
    function RefProbe() {
      const { file } = useWorkspaceFile('b')
      const ref = useRef(file)
      if (ref.current !== file) ref.current = file
      seenRefs.push(file)
      return null
    }

    render(<RefProbe />)
    const initialRef = seenRefs[seenRefs.length - 1]

    // Several notifications targeting file 'a'. Probe subscribes to 'b';
    // it should not re-render at all, and even if a render were
    // triggered by external cause, getSnapshot('b') must keep returning
    // the same reference.
    act(() => {
      setContent('a', 'a2')
      setContent('a', 'a3')
      setContent('a', 'a4')
    })
    const finalRef = seenRefs[seenRefs.length - 1]
    expect(finalRef).toBe(initialRef)
  })

  it('consumer mounted before file registration picks up the file once registered', () => {
    const counter = { count: 0 }
    const { getByTestId } = render(<Probe id="late" counter={counter} />)
    expect(getByTestId('probe-late').getAttribute('data-content')).toBe('')
    act(() => {
      createWorkspaceFile('late', 'late.strudel', 'arrived', 'strudel')
    })
    expect(getByTestId('probe-late').getAttribute('data-content')).toBe('arrived')
  })
})
