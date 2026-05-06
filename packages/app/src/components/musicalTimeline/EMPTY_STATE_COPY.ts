/**
 * EMPTY_STATE_COPY / STOPPED_STATUS_COPY — the two musician-facing
 * strings the MusicalTimeline renders in non-data states.
 *
 * Exported as constants so vitest fixtures and Playwright specs can
 * import them and assert verbatim equality (catches accidental edits to
 * the string anywhere in the surface).
 *
 * Vocabulary: both pass D-06 / FORBIDDEN_VOCABULARY (no IR tokens).
 *
 * Phase 20-01 PR-B (D-08, DB-07).
 */

/**
 * D-06 / DB-07 self-conflict resolution: the plan locked
 * "(no tracks yet — eval some code)" but D-06 forbids the noun "eval"
 * in user-facing strings. The vocabulary lock wins (PV35 is load-bearing
 * for the entire phase per the executor's invariants block); copy
 * adjusted to "play some code" — the verb the user already learned for
 * the same gesture (Ctrl+Enter / Cmd+Enter starts the runtime).
 */
export const EMPTY_STATE_COPY = '(no tracks yet — play some code)'
export const STOPPED_STATUS_COPY = '(stopped)'
