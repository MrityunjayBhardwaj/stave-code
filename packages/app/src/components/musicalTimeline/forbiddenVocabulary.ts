/**
 * forbiddenVocabulary — single source of truth for the IR-vocabulary
 * regex applied to every musician-facing string surface (DOM textContent,
 * `title` attributes, `aria-label` attributes) on the MusicalTimeline.
 *
 * Audience for this surface is locked MUSICIAN by PV35; PV32 / D-06
 * forbid IR vocabulary anywhere a user might read it. Both the vitest
 * component probe and the Playwright spec import this regex so the two
 * test layers cannot drift.
 *
 * Allowed nouns (D-06): track, voice, bar, beat, note, sample, instrument,
 * pattern, cycle, playhead, drumkit, BPM, cps.
 *
 * Forbidden nouns: snapshot, publishIRSnapshot, captureSnapshot, IREvent,
 * IRNode, trackId (musician says "track" without the "Id" suffix), publishIR,
 * loc, IR (as a token), pass, tick, pin, eval.
 *
 * Note: `event` (lowercase) appears as an IREvent FIELD name in code paths
 * but never in user-facing strings; this regex deliberately omits it to
 * avoid false-positives in JSX text checks that include data-attribute
 * names. The musician-facing word is "note", which IS exclusively used in
 * tooltips and labels.
 *
 * Phase 20-01 PR-B (DB-07).
 */

/**
 * Matches any forbidden IR-vocabulary token in a user-facing string.
 *
 * Word boundaries (`\b`) keep "patterns" safe (allowed) while "pattern"
 * isn't on the list at all (it IS allowed); but "tick" (forbidden) won't
 * eat "ticker" (which we don't ship anyway, but defensive). The `IR\b`
 * branch catches the bare "IR" token without matching e.g. "irrelevant".
 *
 * Case-insensitive — vocabulary leaks tend to be capitalized in chrome.
 */
export const FORBIDDEN_VOCABULARY =
  /\b(?:snapshot|publishIRSnapshot|captureSnapshot|IREvent|IRNode|trackId|publishIR|loc)\b|\bIR\b|\bpass\b|\btick\b|\bpin\b|\beval\b/i
