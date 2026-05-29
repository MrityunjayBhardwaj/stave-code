/**
 * HistoryPanel — the project commit store's user surface (Phase G, #197).
 *
 * Renders the commit graph as a vertical timeline with a File⟷Project scope
 * toggle, a branch selector, and per-commit actions:
 *   - Restore: revert the project (or just the active file in File scope) to
 *     the commit, recording a new commit (non-destructive — prior state stays
 *     in history).
 *   - Fork: start a new branch at the commit and switch to it.
 *   - View: read-only peek — Project scope lists the files the commit changed;
 *     File scope shows that file's content at the commit. (The β "runtime
 *     follows the view" time-travel is a deferred follow-up; this View is a
 *     non-destructive content peek, not a runtime override.)
 *
 * Reads the service singleton + re-renders on subscribeToHistory.
 */

import * as React from 'react'
import {
  getCurrentHistory,
  subscribeToHistory,
  getActiveHistoryFile,
  commitWorkspace,
  restoreProject,
  restoreFileToCommit,
  createBranchAt,
  switchToBranch,
} from './historyService'
import {
  listCommits,
  fileHistory,
  listBranches,
  getFileContentAt,
  type Commit,
} from './historyGraph'

type Scope = 'project' | 'file'

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

export function HistoryPanel(): React.ReactElement {
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => subscribeToHistory(force as () => void), [])

  const [scope, setScope] = React.useState<Scope>('project')
  const [forking, setForking] = React.useState<string | null>(null)
  const [forkName, setForkName] = React.useState('')
  const [viewing, setViewing] = React.useState<string | null>(null)
  const [committing, setCommitting] = React.useState(false)
  const [commitLabel, setCommitLabel] = React.useState('')

  const h = getCurrentHistory()
  const activeFile = getActiveHistoryFile()
  const now = Date.now()

  const wrap: React.CSSProperties = {
    padding: 12,
    fontSize: 12,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    color: fg,
    height: '100%',
    overflow: 'auto',
  }

  if (!h) {
    return (
      <div data-bottom-panel-tab="history" style={{ ...wrap, color: muted }}>
        No history yet — start editing and commits will appear here.
      </div>
    )
  }

  const branches = listBranches(h)
  const effectiveScope: Scope = scope === 'file' && !activeFile ? 'project' : scope
  const commits: Commit[] =
    effectiveScope === 'file' && activeFile ? fileHistory(h, activeFile) : listCommits(h)

  const doRestore = (c: Commit): void => {
    if (effectiveScope === 'file' && activeFile) {
      void restoreFileToCommit(activeFile, c.id)
    } else {
      void restoreProject(c.id)
    }
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
    if (!label) return // labels are required for manual checkpoints
    // allowEmpty: a manual commit names the current exact state even with no
    // diff since HEAD (git --allow-empty); it's an anchor, exempt from pruning.
    void commitWorkspace('manual', { label, allowEmpty: true })
    setCommitting(false)
    setCommitLabel('')
  }

  return (
    <div data-bottom-panel-tab="history" style={wrap}>
      {/* controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
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
        <div style={{ display: 'flex', border: `1px solid ${border}`, borderRadius: 4, overflow: 'hidden' }}>
          {(['project', 'file'] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              data-history-scope={s}
              style={{
                ...btn({ border: 'none', borderRadius: 0 }),
                background: effectiveScope === s ? accent : 'transparent',
                color: effectiveScope === s ? '#0b0b0f' : fg,
              }}
            >
              {s === 'project' ? 'Project' : 'File'}
            </button>
          ))}
        </div>
        {scope === 'file' && !activeFile && (
          <span style={{ color: muted, fontSize: 11 }}>open a file for File scope</span>
        )}
        <button
          onClick={() => setCommitting((v) => !v)}
          data-history-commit-now
          style={{ ...btn({ borderColor: accent, color: accent }), marginLeft: 'auto' }}
        >
          + Commit
        </button>
      </div>

      {/* manual commit (named checkpoint) */}
      {committing && (
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
            style={{ ...btn(), flex: 1, color: fg, background: 'var(--background, #16161a)' }}
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

      {/* commit list */}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} data-history-commit-list>
        {commits.map((c) => {
          const changedFileIds = Object.keys(c.files)
          return (
            <li
              key={c.id}
              data-history-commit={c.id}
              style={{ borderLeft: `2px solid ${border}`, paddingLeft: 10, marginLeft: 4, paddingBottom: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: c.kind === 'manual' ? accent : muted,
                    letterSpacing: 0.5,
                  }}
                >
                  {KIND_LABEL[c.kind] ?? c.kind}
                </span>
                <span style={{ flex: 1 }}>{c.label ?? `${changedFileIds.length} file${changedFileIds.length === 1 ? '' : 's'}`}</span>
                <span style={{ color: muted, fontSize: 11 }}>{relTime(c.createdAt, now)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button style={btn()} onClick={() => doRestore(c)} data-history-restore={c.id}>
                  Restore
                </button>
                <button style={btn()} onClick={() => setForking(forking === c.id ? null : c.id)} data-history-fork={c.id}>
                  Fork
                </button>
                <button style={btn()} onClick={() => setViewing(viewing === c.id ? null : c.id)} data-history-view={c.id}>
                  {viewing === c.id ? 'Hide' : 'View'}
                </button>
              </div>

              {forking === c.id && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    autoFocus
                    value={forkName}
                    placeholder="branch name"
                    onChange={(e) => setForkName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmFork(c)}
                    style={{ ...btn(), color: fg, background: 'var(--background, #16161a)' }}
                  />
                  <button style={btn({ borderColor: accent })} onClick={() => confirmFork(c)}>
                    Create
                  </button>
                </div>
              )}

              {viewing === c.id && (
                <pre
                  data-history-view-body
                  style={{
                    marginTop: 6,
                    padding: 8,
                    background: 'var(--background, #16161a)',
                    border: `1px solid ${border}`,
                    borderRadius: 4,
                    fontSize: 11,
                    maxHeight: 220,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {effectiveScope === 'file' && activeFile
                    ? (getFileContentAt(h, activeFile, c.id) ?? '(file did not exist at this commit)')
                    : changedFileIds.length
                      ? changedFileIds.join('\n')
                      : '(no file changes)'}
                </pre>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
