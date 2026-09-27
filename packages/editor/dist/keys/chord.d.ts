/**
 * One chord builder for every key in Stave (#1799).
 *
 * A chord is a string like `mod+shift+z`: modifiers, then one key token. The
 * app's command dispatcher, a panel's scoped commands and the Shortcuts panel's
 * "press a key to rebind" capture all build chords HERE, so a binding recorded
 * in Settings is always the chord the dispatcher will match. The grids live in
 * this package, which is why the builder does too — the app imports it, never
 * the other way round.
 *
 * ⚠ `e.key` IS THE CHARACTER A KEYSTROKE PRODUCED, NOT THE KEY PRESSED.
 * Measured with real OS key presses (macOS 15.4.1, ABC layout, headed Chromium
 * and Firefox, 2026-09-27):
 *
 *   ⌥K        key "Dead"                      code "KeyK"
 *   ⌥⌘K       key "Dead" (Chromium) "˚" (FF)  code "KeyK"
 *   ⇧3        key "#"                         code "Digit3"
 *   Space     key " "                         code "Space"
 *
 * So the key token is the LABEL when the label is a plain letter, digit or
 * punctuation mark (⌘Z stays on the key marked Z on every layout), and the
 * PHYSICAL KEY (`e.code`) when the label is a dead key, a character the chord
 * vocabulary has no name for (⌥ composition, a non-Latin layout), or the
 * shifted symbol of a digit/punctuation key (⇧3 is `shift+3`, not `shift+#`).
 *
 * ⚠ Control and Command are DIFFERENT keys on a Mac. `mod` is ⌘ there and
 * Control elsewhere; a Mac's Control is its own `ctrl` token, so ⌃⌫ and ⌘⌫ are
 * two chords (Logic's Clear Step is ⌃⌫). Off a Mac, Ctrl and the Windows/Super
 * key both still read as `mod`, as they always have.
 *
 * Known residual: a non-QWERTY layout whose letters sit on other physical keys
 * is matched by label while the label is Latin, and by QWERTY position only
 * when the label is not. A real layout map is out of scope.
 */
type ChordOptions = {
    /** Platform override; defaults to `navigator.platform` containing "Mac". */
    isMac?: boolean;
    /**
     * Take the key token from the physical key only (`e.code`), ignoring the
     * label — for keys that are a LAYOUT rather than a letter (a piano keyboard
     * on the home row), which must stay put when the layout changes.
     */
    byPosition?: boolean;
};
type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;
declare function isMacPlatform(): boolean;
/** Key token for a physical key: `KeyK` → `k`, `Digit3` → `3`, `Space` → `space`. */
declare function tokenForCode(code: string): string;
/** True for a keydown of a modifier alone — a capture should keep waiting. */
declare function isModifierOnlyKey(e: Pick<KeyboardEvent, 'key'>): boolean;
/** Build the chord a keystroke means, e.g. `mod+shift+z`, `alt+k`, `ctrl+backspace`. */
declare function chordFromEvent(e: KeyEventLike, opts?: ChordOptions): string;
/** Canonical form of one chord: aliases resolved, modifiers in a fixed order. */
declare function normalizeChord(chord: string, opts?: ChordOptions): string;
/** Does the chord a keystroke built match a declared binding? */
declare function chordMatches(eventChord: string, declared: string, opts?: ChordOptions): boolean;

export { type ChordOptions, chordFromEvent, chordMatches, isMacPlatform, isModifierOnlyKey, normalizeChord, tokenForCode };
