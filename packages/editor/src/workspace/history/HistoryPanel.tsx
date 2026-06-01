/**
 * HistoryPanel — the project commit graph (Version History side panel).
 *
 * A VS Code / GitLens-style source-control graph: PROJECT-level commit history
 * (no per-file mode — that's a separate "File History" action on a file). Each
 * commit row has a branch-lane graph gutter, a kind badge + label + time, and
 * hover-revealed icon actions (Restore / Fork / View). Expanding a commit lists
 * the files it changed; clicking a file opens its diff.
 *
 * Reads the service singleton + re-renders on subscribeToHistory.
 */

import * as React from 'react'
import {
  getCurrentHistory,
  subscribeToHistory,
  commitWorkspace,
  restoreProject,
  restoreFileToCommit,
  createBranchAt,
  switchToBranch,
  getFileHistoryTarget,
  setFileHistoryTarget,
  getModifiedFileIdsSinceHead,
  discardFileChanges,
} from './historyService'
import { listCommits, fileHistory, listBranches, countManualCommits, snapshotAt, type Commit } from './historyGraph'
import { subscribeToDocUpdate } from '../projectDoc'
import {
  enterRuntimeView,
  exitRuntimeView,
  getViewedCommit,
  subscribeToRuntimeView,
} from './historyViewing'

/** Request to open a read-only history viewer in the main editor area (#210). */
export interface OpenHistoryTabRequest {
  readonly mode: 'diff' | 'view'
  readonly commitId: string
  readonly fileId: string
  /** Diff: open in "vs current" (live ↔ commit) by default — the uncommitted diff (#211). */
  readonly vsCurrent?: boolean
  /** Diff: file-picker scope override (the dirty set) so a file HEAD didn't touch is selectable (#211). */
  readonly pickerFileIds?: readonly string[]
}

export interface HistoryPanelProps {
  /**
   * Open a Diff / time-travel View as a tab in the main editor area
   * (wired by the app to `shellRef.openHistoryTab`). Diff/View no longer
   * render as a cramped in-panel overlay (#210).
   */
  readonly onOpenHistoryTab?: (req: OpenHistoryTabRequest) => void
}

const KIND_LABEL: Record<string, string> = {
  seed: 'initial',
  auto: 'auto',
  manual: 'saved',
  fork: 'fork',
}

function fileLabelFor(h: { fileMeta: Record<string, { path?: string }> }, fileId: string): string {
  return h.fileMeta[fileId]?.path ?? fileId
}

function relTime(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const muted = 'var(--foreground-muted, #a0a0aa)'
const fg = 'var(--foreground, #e6e6ea)'
const border = 'var(--border, #2a2a32)'
const accent = 'var(--accent, #6ea8fe)'
const bgInput = 'var(--background, #16161a)'

const GUTTER_W = 22 // px — branch-lane graph column
const DOT_CY = 13 // px — dot centre from row top (aligns with the title line)

// ── inline icons (editor pkg has no Codicon component) ────────────────────
type IconProps = { size?: number }
function svg(path: React.ReactNode, size = 14): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  )
}
const IconRestore = ({ size }: IconProps) => svg(<>
  <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
  <path d="M2.5 2.5V5h2.5" />
</>, size)
const IconFork = ({ size }: IconProps) => svg(<>
  <circle cx="4.5" cy="3.5" r="1.6" />
  <circle cx="4.5" cy="12.5" r="1.6" />
  <circle cx="11.5" cy="3.5" r="1.6" />
  <path d="M4.5 5.1v6M11.5 5.1c0 3-7 1.5-7 4.4" />
</>, size)
const IconDiff = ({ size }: IconProps) => svg(<>
  <path d="M5 2.5v8M11 5.5v8" />
  <circle cx="5" cy="12.5" r="1.5" /><circle cx="11" cy="3.5" r="1.5" />
  <path d="M5 4.5a3 3 0 0 0 3 3h3" />
</>, size)
// Checkout — arrow entering the commit node (time-travel here).
const IconCheckout = ({ size }: IconProps) => svg(<>
  <path d="M2 8h8" />
  <path d="M7 5l3 3-3 3" />
  <circle cx="13" cy="8" r="1.6" />
</>, size)
// Exit time-travel — arrow leaving back to live (shown on the checked-out commit).
const IconExit = ({ size }: IconProps) => svg(<>
  <path d="M14 8H6" />
  <path d="M9 5L6 8l3 3" />
  <circle cx="3" cy="8" r="1.6" />
</>, size)
// Discard — revert working changes to HEAD (counter-clockwise undo arrow).
// Distinct from IconRestore (commit-row restore) so the two don't read alike.
const IconDiscard = ({ size }: IconProps) => svg(<>
  <path d="M3.5 8a4.5 4.5 0 1 1 1.3 3.2" />
  <path d="M3.5 4.8V8h3.2" />
</>, size)
const IconChevron = ({ open }: { open: boolean }) => (
  <span style={{ display: 'inline-block', transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : 'none', color: muted, fontSize: 10 }}>▶</span>
)

// #207 — soft nudge once manual checkpoints (never auto-pruned) pile up.
const MANUAL_NUDGE_DEFAULT = 50
function manualNudgeThreshold(): number {
  if (typeof window === 'undefined') return MANUAL_NUDGE_DEFAULT
  const raw = window.localStorage.getItem('stave:manualNudgeThreshold')
  const n = raw !== null ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : MANUAL_NUDGE_DEFAULT
}

function btn(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'transparent',
    color: fg,
    border: `1px solid ${border}`,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
    ...extra,
  }
}
function iconBtn(): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    color: muted,
    cursor: 'pointer',
    padding: 2,
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 3,
  }
}

/**
 * Branch-lane gutter cell for one commit row. The whole cell is the
 * "check out this commit" hit target (GitLens/GitHub mental model) — click
 * it to time-travel the editor + runtime to that commit (#204). The dot
 * fills accent when this commit is the one being viewed.
 */
function GraphGutter({
  isNewest,
  isOldest,
  isHead,
  isViewed,
  forks,
  onCheckout,
  commitId,
  clickable,
}: {
  isNewest: boolean
  isOldest: boolean
  isHead: boolean
  isViewed: boolean
  forks: number
  onCheckout: () => void
  commitId: string
  /** Checkout is project-scoped, so the dot is inert in File History mode (#C). */
  clickable: boolean
}): React.ReactElement {
  const x = GUTTER_W / 2
  const dotColor = isViewed ? accent : isHead ? accent : bgInput
  const ringColor = isViewed ? accent : isHead ? accent : muted
  // Common visual content (spines, fork stub, halo, dot).
  const inner = (
    <>
      {/* spine above (to newer commit) */}
      {!isNewest && <span style={{ position: 'absolute', left: x - 1, top: 0, height: DOT_CY, width: 2, background: border }} />}
      {/* spine below (to older commit) */}
      {!isOldest && <span style={{ position: 'absolute', left: x - 1, top: DOT_CY, bottom: 0, width: 2, background: border }} />}
      {/* fork stub — a short branch-off line up-right where a branch was created here */}
      {forks > 0 && (
        <svg style={{ position: 'absolute', left: x - 1, top: 0 }} width={GUTTER_W} height={DOT_CY + 2}>
          <path d={`M1 ${DOT_CY} C 1 ${DOT_CY / 2}, ${GUTTER_W - 3} ${DOT_CY / 2}, ${GUTTER_W - 3} 1`} fill="none" stroke={accent} strokeWidth="1.6" />
        </svg>
      )}
      {/* viewed halo */}
      {isViewed && (
        <span style={{ position: 'absolute', left: x - 7, top: DOT_CY - 7, width: 14, height: 14, borderRadius: '50%', border: `1px solid ${accent}`, opacity: 0.5, boxSizing: 'border-box' }} />
      )}
      {/* commit dot */}
      <span
        style={{
          position: 'absolute',
          left: x - 4,
          top: DOT_CY - 4,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          border: `2px solid ${ringColor}`,
          boxSizing: 'border-box',
        }}
      />
    </>
  )
  const cell: React.CSSProperties = {
    position: 'relative', width: GUTTER_W, flex: '0 0 auto', alignSelf: 'stretch',
    background: 'transparent', border: 'none', padding: 0,
  }
  // File History mode: checkout is project-scoped, so the dot is a plain
  // marker (no time-travel from a per-file view).
  if (!clickable) {
    return <div style={cell} aria-hidden>{inner}</div>
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCheckout() }}
      data-history-checkout={commitId}
      title="Check out this commit — time-travel the editor + runtime here"
      aria-label="Check out this commit"
      style={{ ...cell, cursor: 'pointer' }}
    >
      {inner}
    </button>
  )
}

export function HistoryPanel({ onOpenHistoryTab }: HistoryPanelProps = {}): React.ReactElement {
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => subscribeToHistory(force as () => void), [])
  // re-render on time-travel enter/exit so the checked-out dot highlights (#204)
  React.useEffect(() => subscribeToRuntimeView(force as () => void), [])
  // The "Uncommitted Changes" section (#211) reflects the live dirty-vs-HEAD
  // set, which changes the moment you type — not on a history commit. Re-derive
  // on local doc edits, debounced like FileTree so per-keystroke churn doesn't
  // thrash the panel.
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const off = subscribeToDocUpdate(
      () => {
        if (t) clearTimeout(t)
        t = setTimeout(force as () => void, 250)
      },
      { localOnly: true },
    )
    return () => {
      off()
      if (t) clearTimeout(t)
    }
  }, [])
  const viewedCommit = getViewedCommit()
  // While time-travelling, the panel is read-only: branch switch / +Commit /
  // Restore / Fork all WRITE the workspace, which is confusing mid-view. Gate
  // them and let the user navigate via checkout/exit or the banner's "Fork to
  // edit" (#D). `lockMsg` is the shared tooltip.
  const viewing = viewedCommit !== null
  const lockMsg = 'Exit time-travel to edit'

  const [forking, setForking] = React.useState<string | null>(null)
  const [forkName, setForkName] = React.useState('')
  const [committing, setCommitting] = React.useState(false)
  const [commitLabel, setCommitLabel] = React.useState('')
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false)
  // "Uncommitted Changes" section (#211): collapse state + the set of files the
  // user UN-checked (track the exclusions so a newly-dirtied file defaults to
  // checked without re-seeding state on every render).
  const [uncommittedCollapsed, setUncommittedCollapsed] = React.useState(false)
  const [uncheckedFiles, setUncheckedFiles] = React.useState<ReadonlySet<string>>(new Set())

  const h = getCurrentHistory()
  const now = Date.now()

  const wrap: React.CSSProperties = {
    padding: 12,
    fontSize: 12,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    color: fg,
    height: '100%',
    overflow: 'auto',
    position: 'relative',
  }

  if (!h) {
    return (
      <div data-bottom-panel-tab="history" style={{ ...wrap, color: muted }}>
        No history yet — start editing and commits will appear here.
      </div>
    )
  }

  const branches = listBranches(h)
  const fileTarget = getFileHistoryTarget()
  const commits = fileTarget ? fileHistory(h, fileTarget) : listCommits(h)
  const manualCount = countManualCommits(h)
  const showNudge = !nudgeDismissed && manualCount > manualNudgeThreshold()
  const headCommitId = h.branches[h.currentBranch]?.head ?? null

  // Uncommitted changes (#211): files whose live content differs from HEAD.
  // Project mode only — File History mode is scoped to one file's commit log.
  const dirtyIds = fileTarget
    ? []
    : [...getModifiedFileIdsSinceHead()].sort((a, b) =>
        fileLabelFor(h, a).localeCompare(fileLabelFor(h, b)),
      )
  const checkedDirty = dirtyIds.filter((id) => !uncheckedFiles.has(id))

  // commits that other branches were forked from (for the graph fork stub)
  const forkCounts = new Map<string, number>()
  for (const b of branches) {
    if (b.createdFrom) forkCounts.set(b.createdFrom, (forkCounts.get(b.createdFrom) ?? 0) + 1)
  }

  const confirmFork = (c: Commit): void => {
    const name = forkName.trim()
    if (!name) return
    void createBranchAt(name, c.id).then(() => switchToBranch(name))
    setForking(null)
    setForkName('')
  }
  const confirmCommit = (): void => {
    const label = commitLabel.trim()
    if (!label) return
    // Selective commit (#211): when there ARE working changes, commit only the
    // checked subset (the rest stays dirty for a later commit). With no working
    // changes, keep the label-only anchor behaviour (allowEmpty).
    const only = dirtyIds.length > 0 ? new Set(checkedDirty) : undefined
    void commitWorkspace('manual', { label, allowEmpty: true, ...(only ? { only } : {}) })
    setCommitting(false)
    setCommitLabel('')
  }
  const fileLabel = (fileId: string): string => fileLabelFor(h, fileId)
  const toggleChecked = (id: string): void =>
    setUncheckedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const doDiscard = (id: string): void => void discardFileChanges(id)
  // Live ↔ HEAD diff in the main editor (reuses the diff tab, #210/#211): the
  // file's HEAD content vs its working content. Picker scopes to the dirty set.
  const openUncommittedDiff = (id: string): void => {
    if (!headCommitId) return
    onOpenHistoryTab?.({
      mode: 'diff',
      commitId: headCommitId,
      fileId: id,
      vsCurrent: true,
      pickerFileIds: dirtyIds,
    })
  }
  // In File History mode, Restore reverts just that file; otherwise the project.
  const doRestore = (c: Commit): void => {
    if (fileTarget) void restoreFileToCommit(fileTarget, c.id)
    else void restoreProject(c.id)
  }
  // Check out a commit: time-travel the editor + runtime to its whole-project
  // snapshot, read-only (#204). Y.Text is untouched; Exit restores HEAD.
  const doCheckout = (c: Commit): void => {
    enterRuntimeView(c.id, snapshotAt(h, c.id).files)
  }

  return (
    <div data-bottom-panel-tab="history" style={wrap}>
      {/* controls — File History mode shows a focused header; project mode the
          branch selector + commit */}
      {fileTarget ? (
        <div data-history-file-mode style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setFileHistoryTarget(null)}
            data-history-file-back
            title="Back to project history"
            style={iconBtn()}
          >
            <span style={{ fontSize: 13 }}>‹</span>
          </button>
          <span style={{ color: muted, display: 'inline-flex' }}><IconDiff size={13} /></span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {fileLabel(fileTarget)}
          </span>
          <span style={{ color: muted, fontSize: 10 }}>file history</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <select
            aria-label="branch"
            value={h.currentBranch}
            onChange={(e) => void switchToBranch(e.target.value)}
            disabled={viewing}
            title={viewing ? lockMsg : undefined}
            style={{ ...btn(), padding: '2px 6px', opacity: viewing ? 0.5 : 1, cursor: viewing ? 'not-allowed' : 'pointer' }}
            data-history-branch-select
          >
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCommitting((v) => !v)}
            disabled={viewing}
            title={viewing ? lockMsg : undefined}
            data-history-commit-now
            style={{ ...btn({ borderColor: accent, color: accent }), marginLeft: 'auto', whiteSpace: 'nowrap', opacity: viewing ? 0.5 : 1, cursor: viewing ? 'not-allowed' : 'pointer' }}
          >
            + Commit
          </button>
        </div>
      )}

      {!fileTarget && committing && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            autoFocus
            aria-label="checkpoint label"
            value={commitLabel}
            placeholder="checkpoint label (e.g. v1 demo state)"
            onChange={(e) => setCommitLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmCommit()
              else if (e.key === 'Escape') {
                setCommitting(false)
                setCommitLabel('')
              }
            }}
            data-history-commit-label
            style={{ ...btn(), flex: 1, color: fg, background: bgInput }}
          />
          <button
            onClick={confirmCommit}
            disabled={!commitLabel.trim()}
            data-history-commit-save
            style={btn({
              borderColor: accent,
              opacity: commitLabel.trim() ? 1 : 0.5,
              cursor: commitLabel.trim() ? 'pointer' : 'not-allowed',
            })}
          >
            Save
          </button>
        </div>
      )}

      {!fileTarget && showNudge && (
        <div
          data-history-manual-nudge
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '6px 10px', fontSize: 11, color: fg, background: bgInput,
            border: `1px solid ${border}`, borderRadius: 4,
          }}
        >
          <span style={{ flex: 1, color: muted }}>
            {manualCount} saved checkpoints — kept permanently (never auto-pruned). Restore or
            Fork from any; auto-commits are still pruned on their own.
          </span>
          <button onClick={() => setNudgeDismissed(true)} data-history-nudge-dismiss aria-label="dismiss checkpoint notice" style={btn({ padding: '1px 7px' })}>✕</button>
        </div>
      )}

      {/* Uncommitted Changes (#211) — VS Code "Source Control" working set.
          Project mode only; collapsible header + count badge; per-row select +
          live↔HEAD diff + Discard. Lives above the commit graph. */}
      {!fileTarget && (
        <div data-history-uncommitted style={{ marginBottom: 12 }}>
          <div
            onClick={() => setUncommittedCollapsed((v) => !v)}
            data-history-uncommitted-header
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: dirtyIds.length && !uncommittedCollapsed ? 6 : 0, userSelect: 'none' }}
          >
            <IconChevron open={!uncommittedCollapsed} />
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: muted, fontWeight: 600 }}>
              Uncommitted Changes
            </span>
            {dirtyIds.length > 0 && (
              <span
                data-history-uncommitted-count
                style={{ fontSize: 9, fontWeight: 600, color: bgInput, background: accent, borderRadius: 9, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}
              >
                {dirtyIds.length}
              </span>
            )}
          </div>

          {!uncommittedCollapsed && (
            dirtyIds.length === 0 ? (
              <div data-history-uncommitted-empty style={{ color: muted, fontSize: 11, marginLeft: 16, padding: '2px 0' }}>
                No uncommitted changes
              </div>
            ) : (
              <ul data-history-uncommitted-list style={{ listStyle: 'none', margin: 0, padding: 0, marginLeft: 2 }}>
                {dirtyIds.map((id) => (
                  <li
                    key={id}
                    data-history-uncommitted-file={id}
                    onMouseEnter={() => setHovered(`u:${id}`)}
                    onMouseLeave={() => setHovered((cur) => (cur === `u:${id}` ? null : cur))}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 24, padding: '1px 0' }}
                  >
                    <input
                      type="checkbox"
                      checked={!uncheckedFiles.has(id)}
                      onChange={() => toggleChecked(id)}
                      data-history-uncommitted-check={id}
                      aria-label={`stage ${fileLabel(id)} for commit`}
                      style={{ flex: '0 0 auto', cursor: 'pointer', accentColor: accent }}
                    />
                    <button
                      onClick={() => openUncommittedDiff(id)}
                      data-history-uncommitted-diff={id}
                      title={`Diff ${fileLabel(id)} vs HEAD`}
                      style={{ ...iconBtn(), flex: 1, justifyContent: 'flex-start', gap: 6, padding: '2px 4px', color: fg, fontSize: 11, minWidth: 0 }}
                    >
                      <span style={{ color: muted, display: 'inline-flex' }}><IconDiff size={12} /></span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileLabel(id)}</span>
                    </button>
                    <button
                      onClick={() => doDiscard(id)}
                      disabled={viewing}
                      data-history-uncommitted-discard={id}
                      title={viewing ? lockMsg : `Discard changes to ${fileLabel(id)} (revert to HEAD)`}
                      style={{ ...iconBtn(), flex: '0 0 auto', opacity: viewing ? 0.35 : hovered === `u:${id}` ? 1 : 0.5, cursor: viewing ? 'not-allowed' : 'pointer' }}
                    >
                      <IconDiscard />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}

      {/* commit graph */}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} data-history-commit-list>
        {commits.map((c, i) => {
          const changedFileIds = Object.keys(c.files)
          const isOpen = expanded === c.id
          const isHovered = hovered === c.id
          // Drop a label that just echoes the kind badge (the seed's
          // auto "Initial" under the INITIAL badge, #5) — fall back to the
          // changed-file count, which is actually informative.
          const kindWord = KIND_LABEL[c.kind] ?? c.kind
          const fileCountText = `${changedFileIds.length} file${changedFileIds.length === 1 ? '' : 's'}`
          const labelText =
            c.label && c.label.toLowerCase() !== kindWord.toLowerCase() ? c.label : fileCountText
          return (
            <li key={c.id} data-history-commit={c.id} style={{ position: 'relative' }}>
              <div
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered((cur) => (cur === c.id ? null : cur))}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minHeight: 30 }}
              >
                <GraphGutter
                  commitId={c.id}
                  isNewest={i === 0}
                  isOldest={i === commits.length - 1}
                  isHead={c.id === h.branches[h.currentBranch]?.head}
                  isViewed={c.id === viewedCommit}
                  forks={fileTarget ? 0 : forkCounts.get(c.id) ?? 0}
                  onCheckout={() => doCheckout(c)}
                  clickable={!fileTarget}
                />
                {/* content */}
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    data-history-commit-toggle={c.id}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer' }}
                  >
                    <span style={{ alignSelf: 'center' }}><IconChevron open={isOpen} /></span>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', color: c.kind === 'manual' ? accent : muted, letterSpacing: 0.5, flex: '0 0 auto' }}>
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {labelText}
                    </span>
                    <span style={{ color: muted, fontSize: 10, flex: '0 0 auto' }}>{relTime(c.createdAt, now)}</span>
                  </div>

                  {/* branch refs — project-level, hidden in File History mode
                      (#4). On their own wrapping row so they never squeeze the
                      commit label in the narrow panel (#3). */}
                  {!fileTarget && forkCounts.has(c.id) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3, marginLeft: 20 }}>
                      {branches.filter((b) => b.createdFrom === c.id).map((b) => (
                        <span key={b.name} data-history-branch-chip={b.name} style={{ fontSize: 9, color: accent, border: `1px solid ${accent}`, borderRadius: 8, padding: '0 6px', whiteSpace: 'nowrap' }}>⑂ {b.name}</span>
                      ))}
                    </div>
                  )}

                  {/* hover icon actions — checkout (time-travel) is the first,
                      so the affordance is visible without hovering the dot (B).
                      Checkout is hidden in File History mode (project-scoped, #C);
                      mutating actions are gated while time-travelling (#D). */}
                  <div style={{ display: 'flex', gap: 2, marginTop: 2, marginLeft: 14, opacity: isHovered || isOpen || c.id === viewedCommit ? 1 : 0.18, transition: 'opacity 120ms' }}>
                    {c.id === viewedCommit ? (
                      <button title="Exit time-travel — back to live" style={{ ...iconBtn(), color: accent }} onClick={() => exitRuntimeView()} data-history-checkout-exit={c.id}><IconExit /></button>
                    ) : !fileTarget ? (
                      <button title="Check out — time-travel the editor + runtime here" style={iconBtn()} onClick={() => doCheckout(c)} data-history-checkout-btn={c.id}><IconCheckout /></button>
                    ) : null}
                    <button disabled={viewing} title={viewing ? lockMsg : fileTarget ? 'Restore this file to this commit' : 'Restore project to this commit'} style={{ ...iconBtn(), opacity: viewing ? 0.35 : 1, cursor: viewing ? 'not-allowed' : 'pointer' }} onClick={() => doRestore(c)} data-history-restore={c.id}><IconRestore /></button>
                    <button disabled={viewing} title={viewing ? lockMsg : 'Fork a branch here'} style={{ ...iconBtn(), opacity: viewing ? 0.35 : 1, cursor: viewing ? 'not-allowed' : 'pointer' }} onClick={() => setForking(forking === c.id ? null : c.id)} data-history-fork={c.id}><IconFork /></button>
                  </div>

                  {forking === c.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 14 }}>
                      <input autoFocus value={forkName} placeholder="branch name" onChange={(e) => setForkName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmFork(c)} style={{ ...btn(), flex: 1, color: fg, background: bgInput }} />
                      <button style={btn({ borderColor: accent })} onClick={() => confirmFork(c)}>Create</button>
                    </div>
                  )}

                  {/* drill-down: files changed in this commit → click to diff */}
                  {isOpen && (
                    <ul data-history-commit-files style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, marginLeft: 14 }}>
                      {changedFileIds.length === 0 ? (
                        <li style={{ color: muted, fontSize: 11 }}>label-only checkpoint (no file changes)</li>
                      ) : (
                        changedFileIds.map((fid) => (
                          <li key={fid}>
                            <button
                              onClick={() => onOpenHistoryTab?.({ mode: 'diff', commitId: c.id, fileId: fid })}
                              data-history-file-diff={fid}
                              title={`Diff ${fileLabel(fid)}`}
                              style={{ ...iconBtn(), width: '100%', justifyContent: 'flex-start', gap: 6, padding: '2px 4px', color: fg, fontSize: 11 }}
                            >
                              <span style={{ color: muted, display: 'inline-flex' }}><IconDiff size={12} /></span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileLabel(fid)}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
