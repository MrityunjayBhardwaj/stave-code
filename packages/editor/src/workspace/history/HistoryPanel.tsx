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
} from './historyService'
import { listCommits, fileHistory, listBranches, countManualCommits, snapshotAt, type Commit } from './historyGraph'
import {
  enterRuntimeView,
  getViewedCommit,
  subscribeToRuntimeView,
} from './historyViewing'

/** Request to open a read-only history viewer in the main editor area (#210). */
export interface OpenHistoryTabRequest {
  readonly mode: 'diff' | 'view'
  readonly commitId: string
  readonly fileId: string
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
}: {
  isNewest: boolean
  isOldest: boolean
  isHead: boolean
  isViewed: boolean
  forks: number
  onCheckout: () => void
  commitId: string
}): React.ReactElement {
  const x = GUTTER_W / 2
  const dotColor = isViewed ? accent : isHead ? accent : bgInput
  const ringColor = isViewed ? accent : isHead ? accent : muted
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCheckout() }}
      data-history-checkout={commitId}
      title="Check out this commit — time-travel the editor + runtime here"
      aria-label="Check out this commit"
      style={{
        position: 'relative', width: GUTTER_W, flex: '0 0 auto', alignSelf: 'stretch',
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
      }}
    >
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
    </button>
  )
}

export function HistoryPanel({ onOpenHistoryTab }: HistoryPanelProps = {}): React.ReactElement {
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => subscribeToHistory(force as () => void), [])
  // re-render on time-travel enter/exit so the checked-out dot highlights (#204)
  React.useEffect(() => subscribeToRuntimeView(force as () => void), [])
  const viewedCommit = getViewedCommit()

  const [forking, setForking] = React.useState<string | null>(null)
  const [forkName, setForkName] = React.useState('')
  const [committing, setCommitting] = React.useState(false)
  const [commitLabel, setCommitLabel] = React.useState('')
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false)

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
    void commitWorkspace('manual', { label, allowEmpty: true })
    setCommitting(false)
    setCommitLabel('')
  }
  const fileLabel = (fileId: string): string => h.fileMeta[fileId]?.path ?? fileId
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
            style={{ ...btn(), padding: '2px 6px' }}
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
            data-history-commit-now
            style={{ ...btn({ borderColor: accent, color: accent }), marginLeft: 'auto', whiteSpace: 'nowrap' }}
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

                  {/* hover icon actions */}
                  <div style={{ display: 'flex', gap: 2, marginTop: 2, marginLeft: 14, opacity: isHovered || isOpen ? 1 : 0.18, transition: 'opacity 120ms' }}>
                    <button title={fileTarget ? 'Restore this file to this commit' : 'Restore project to this commit'} style={iconBtn()} onClick={() => doRestore(c)} data-history-restore={c.id}><IconRestore /></button>
                    <button title="Fork a branch here" style={iconBtn()} onClick={() => setForking(forking === c.id ? null : c.id)} data-history-fork={c.id}><IconFork /></button>
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
