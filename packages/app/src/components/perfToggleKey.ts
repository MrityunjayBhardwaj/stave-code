/**
 * Does this keystroke mean "toggle the performance overlay"? (Alt+P, #1423)
 *
 * Its own module, and a pure predicate, for two reasons: it can be tested
 * without pulling `StaveApp` into jsdom, and the rule becomes something you can
 * read instead of something buried in a `useEffect`.
 *
 * ⚠ THE WHOLE POINT IS `e.code` RATHER THAN `e.key`. `e.key` is the character
 * the keystroke PRODUCED, not the key that was pressed, and on macOS Option is
 * a character-composition modifier: Option+p produces `π`, Option+Shift+P
 * produces `∏`. The original check tested `e.key === "p" || e.key === "P"`, so
 * on the platform it was written for it matched nothing and the overlay could
 * not be opened at all.
 *
 * ⚠ The same confusion, read the other way, is what let ⌘⇧D duplicate a clip
 * (#1421): there Shift+d IS `'D'`, so the check was too WIDE. Here Option+p is
 * NOT `'p'`, so it was too NARROW. One misreading, two opposite symptoms.
 *
 * ⚠ Why `e.key` is still accepted as well, rather than replaced outright:
 * `e.code` names a PHYSICAL POSITION (`KeyP` is wherever QWERTY puts P), while
 * `e.key` names the character. Neither alone is right for a mnemonic shortcut —
 * "P for performance" is about the letter, but the letter is what macOS
 * composes away. Accepting either covers macOS-QWERTY by position and a
 * remapped layout by character.
 *
 * ⚠ Known residual, stated rather than hidden: a non-QWERTY layout ON macOS is
 * still not served. Pressing that layout's `p` yields a composed `e.key` AND an
 * `e.code` for some other physical key, so neither branch fires. Fixing that
 * needs a real layout map, which is a much larger thing than this toggle
 * warrants — this is a debug overlay, not a core gesture.
 */
export function isPerfOverlayToggle(e: KeyboardEvent): boolean {
  // Alt ALONE. A chord carrying Cmd/Ctrl belongs to the command registry, and
  // claiming it here would be the cross-surface collision that #1421 was.
  if (!e.altKey || e.ctrlKey || e.metaKey) return false;
  return e.code === "KeyP" || e.key === "p" || e.key === "P";
}
