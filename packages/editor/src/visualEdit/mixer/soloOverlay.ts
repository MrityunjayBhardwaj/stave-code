/**
 * soloOverlay — the eval-input transform for SOLO (#550-S5, design §6.5 / D3).
 *
 * Solo is ephemeral monitoring state: "let me hear these alone." It must NEVER
 * be written to the file (D3) — only applied to the STRING sent to the engine.
 * `applyMonitorOverlay(doc, soloIds)` returns a source where every NON-soloed
 * top-level statement is silenced, leaving the document on disk untouched; when
 * solo clears, the raw doc evaluates again.
 *
 * Mechanism: reuse the proven `_`-prefix mute idiom (P-MIX-5 — the engine skips
 * a `_`-prefixed id, no scheduler, silent) for labelled statements; for a rare
 * unlabelled bare expression (which can't take a `_`), wrap it in a JS block
 * comment so it isn't evaluated. Both just stop the statement from making
 * sound; neither is written back to the file.
 *
 * Pure (string → string, no React/audio), so it unit-tests directly and the app
 * can call it at the eval chokepoint with no engine coupling.
 *
 * Safety: identity when nothing is soloed, and — critically — identity when the
 * soloed ids no longer match ANY current strip (a stale solo after an edit),
 * so a dangling solo can never silence the whole mix.
 */
import { detectAllChunks } from '../chunkDetect'
import { buildStripModels } from './stripModel'

interface Insert {
  pos: number
  text: string
}

/**
 * Apply the solo monitoring overlay to `doc`. `soloIds` are strip ids
 * (`buildStripModels` ids — `d1`, `$0`, …). Returns the transformed source, or
 * `doc` unchanged when no solo is in effect.
 */
export function applyMonitorOverlay(doc: string, soloIds: ReadonlySet<string>): string {
  if (soloIds.size === 0) return doc

  const strips = buildStripModels(detectAllChunks(doc))
  // Guard: if none of the soloed ids match a real strip (e.g. the soloed track
  // was renamed/removed since), treat solo as inactive rather than muting
  // everything — a dangling solo must not silence the whole mix.
  const anySoloPresent = strips.some((s) => soloIds.has(s.id))
  if (!anySoloPresent) return doc

  const inserts: Insert[] = []
  for (const strip of strips) {
    if (soloIds.has(strip.id)) continue // soloed → stays audible
    if (strip.muted) continue // already silent (a `_`-muted track)
    const [start, end] = strip.statementRange
    if (strip.muteable) {
      // labelled → `_`-prefix (engine skips it, P-MIX-5)
      inserts.push({ pos: start, text: '_' })
    } else {
      // bare expression → wrap in a block comment so it isn't evaluated
      inserts.push({ pos: start, text: '/* ' })
      inserts.push({ pos: end, text: ' */' })
    }
  }
  if (inserts.length === 0) return doc

  // Apply right-to-left so earlier offsets stay valid as we splice.
  inserts.sort((a, b) => b.pos - a.pos)
  let out = doc
  for (const ins of inserts) {
    out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos)
  }
  return out
}
