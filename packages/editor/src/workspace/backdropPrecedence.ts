/**
 * backdropPrecedence — the pure precedence rule for a pane's backdrop (#350a).
 *
 * A pane (editor group) has two backdrop layers:
 *   - the manual STICKY — the file the user "set as backdrop" (persisted on the
 *     group as `backgroundFileId`); and
 *   - the transient code OVERRIDE — the active program's `.scope()` /
 *     `.viz('x', { backdrop:true })` declaration for the current eval (not
 *     persisted; lives only while the code declares it).
 *
 * The override wins while present; when it clears, the sticky shows again. Kept
 * pure + dependency-free so the precedence is unit-testable without the shell
 * (no React / monaco / DOM).
 */

/**
 * Resolve a group's effective backdrop file id. The transient code OVERRIDE
 * takes precedence over the persisted manual STICKY; `undefined` (neither set)
 * means no backdrop.
 */
export function resolveBackdropFileId(
  stickyFileId: string | undefined,
  overrideFileId: string | undefined,
): string | undefined {
  return overrideFileId ?? stickyFileId
}
