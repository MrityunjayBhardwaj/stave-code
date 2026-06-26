/**
 * blockScan — the single source of truth for "where does one top-level `$:`
 * block end and the next begin?", shared by the engine's inline-viz line
 * computation (`StrudelEngine.buildVizRequestsWithLines`) and the editor's
 * live re-anchor pass (`viewZones.reAnchorZones`).
 *
 * Why this exists (#569): the solo monitor overlay (`applyMonitorOverlay`)
 * silences non-soloed top-level statements WITHOUT touching the file — labelled
 * tracks get a `_` prefix (`$:` → `_$:`, the P-MIX-5 mute idiom) and a bare
 * non-muteable expression is wrapped in a `/* … *​/` block comment. The engine
 * then computes each inline viz's `afterLine` from that overlaid source.
 *
 * A block-end scan that only recognizes `$:`/`setcps` as boundaries treats the
 * silenced `_$:` / `/*` lines as CONTINUATION of the preceding block, so a
 * soloed track greedily absorbs every following silenced line, its end line
 * overruns to EOF, and the inline viz zone re-anchors under an unrelated track.
 * Recognizing the silenced forms here keeps each zone pinned to its own track.
 */

/**
 * True when a trimmed source line begins a NEW top-level statement — counting
 * the silenced forms the solo/mute overlay produces. Used to detect the END of
 * the current `$:` block (the next boundary), NOT to assign block identity:
 *
 *   `$: …`      audible anonymous track
 *   `_$: …`     muted / soloed-out anonymous track (`_`-prefix mute idiom)
 *   `setcps(…)` transport statement — its own top-level block
 *   `/* …`      bare expression wrapped by the solo overlay (non-muteable)
 *
 * NOTE: block-IDENTITY keying (which positional `$N` a zone is) must stay on the
 * bare `$:` form so it agrees with the engine capture side, which skips
 * `_`-prefixed ids. This predicate is only for boundary detection.
 */
export function startsTopLevelBlock(trimmed: string): boolean {
  return /^_?\$:/.test(trimmed) || trimmed.startsWith('setcps') || trimmed.startsWith('/*')
}
