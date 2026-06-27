/**
 * PatternTrackChip — the Pattern tab's "which track am I editing" badge (#589, Phase E).
 *
 * The pianoroll/sequencer edit ONE track (the chunk under the cursor) but showed
 * no name or colour. This chip puts the track's IDENTITY at the focal point: a
 * colour dot + the track name, with the SAME affordances as the Mixer strip and
 * Song Timeline lane — click the dot to recolour, double-click the name to rename.
 *
 * It resolves the identity the same way `LocalMixerStrip` does — match the
 * cursor's chunk to its strip out of the WHOLE-document strip set by the
 * statement-start anchor — so `{name, color}` are byte-identical to the Mixer and
 * Timeline (anonymous `$:` numbering stays correct, GR1). Recolour writes through
 * `setTrackMeta` and rename through `renameEdit`, the same primitives the other
 * views use, so a colour/rename here shows everywhere and migrates on rename, and
 * the per-eval prune (#583) applies.
 */
import * as React from 'react'

import { useActiveChunk } from './useActiveChunk'
import { useMixerModel } from '../mixer/useMixerModel'
import { StripColorPopover } from '../mixer/StripColorPopover'
import { renameEdit } from '../mixer/writeStrip'
import { trackIdentity } from '../trackColor'
import { getActiveFileId, onActiveEditorChange } from '../../workspace/editorRegistry'
import { getTrackMeta, setTrackMeta } from '../../workspace/WorkspaceFile'
import { useTrackMetaMap } from '../../workspace/useTrackMeta'

export function PatternTrackChip(): React.ReactElement | null {
  const { chunk } = useActiveChunk()
  const { strips, applyToStrip } = useMixerModel()
  // Active file for the per-file colour override (same source as the Mixer).
  const [fileId, setFileId] = React.useState<string | null>(() => getActiveFileId())
  React.useEffect(() => onActiveEditorChange(() => setFileId(getActiveFileId())), [])
  const trackMeta = useTrackMetaMap(fileId ?? undefined)

  const [colorAnchor, setColorAnchor] = React.useState<DOMRect | null>(null)
  const [renaming, setRenaming] = React.useState(false)

  // Match the cursor's statement to its strip by the statement-start anchor —
  // the whole-document strip set, so the d{N} numbering matches the Mixer (P-MIX-5).
  const anchor = chunk ? chunk.statementRange[0] : null
  const strip = anchor != null ? strips.find((s) => s.statementRange[0] === anchor) : undefined
  if (!strip) return null

  const customColor = trackMeta.get(strip.name)?.color
  const dotColor = trackIdentity(strip.name, customColor).color

  // Inline rename seed: the bare label (mute marker stripped); anon `$:` seeds
  // empty so the field invites a fresh name (mirrors ChannelStrip, #580).
  const bareLabel = strip.label?.replace(/^_/, '') ?? ''
  const renameSeed = bareLabel !== '' && bareLabel !== '$' ? bareLabel : ''

  const commitRename = (raw: string): void => {
    setRenaming(false)
    const v = raw.trim()
    if (!v) return
    applyToStrip(strip.id, (fresh, wb) => {
      // Reject a rename that would duplicate another track's display name (#585).
      const taken = new Set(strips.filter((s) => s.id !== strip.id).map((s) => s.name))
      const e = renameEdit(fresh, v, taken)
      if (!e) return // renameEdit validates + no-ops + dup-rejects; → silent revert
      wb.replaceRange(e.range, e.text, 'rename')
      // Migrate a custom-colour override from the OLD display name to the new
      // label so the rename doesn't orphan it (#581).
      if (fileId) {
        const prevColor = getTrackMeta(fileId, strip.name).color
        if (prevColor && strip.name !== v) {
          setTrackMeta(fileId, v, { color: prevColor })
          setTrackMeta(fileId, strip.name, { color: undefined })
        }
      }
    })
  }

  return (
    <div
      data-pattern-track-chip
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {fileId ? (
        <button
          type="button"
          data-pattern-track-dot
          aria-label={`Change colour of ${strip.name}`}
          title={`${strip.name} — click to change colour`}
          onClick={(e) => setColorAnchor(e.currentTarget.getBoundingClientRect())}
          style={{
            width: 9,
            height: 9,
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            cursor: 'pointer',
          }}
        />
      ) : (
        <span
          data-pattern-track-dot
          style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }}
        />
      )}
      {colorAnchor && fileId && (
        <StripColorPopover
          anchorRect={colorAnchor}
          currentColor={dotColor}
          onPick={(color) => setTrackMeta(fileId, strip.name, { color })}
          onReset={() => setTrackMeta(fileId, strip.name, { color: undefined })}
          onClose={() => setColorAnchor(null)}
        />
      )}
      {renaming ? (
        <input
          data-pattern-track-rename
          autoFocus
          defaultValue={renameSeed}
          placeholder="name this track"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename(e.currentTarget.value)
            else if (e.key === 'Escape') setRenaming(false)
            e.stopPropagation() // don't let the editor swallow the keystrokes
          }}
          onBlur={(e) => commitRename(e.currentTarget.value)}
          style={{
            minWidth: 0,
            width: 96,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            color: 'var(--foreground, #e6e6ea)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 3,
            padding: '0 3px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          data-pattern-track-name
          title={`${strip.name} — double-click to rename`}
          onDoubleClick={() => setRenaming(true)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--foreground, #e6e6ea)',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'text',
          }}
        >
          {strip.name}
        </span>
      )}
    </div>
  )
}
