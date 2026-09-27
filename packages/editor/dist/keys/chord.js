var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/keys/chord.ts
function isMacPlatform() {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
}
__name(isMacPlatform, "isMacPlatform");
var PUNCTUATION_BY_CODE = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`"
};
function tokenForCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code in PUNCTUATION_BY_CODE) return PUNCTUATION_BY_CODE[code];
  return code.toLowerCase();
}
__name(tokenForCode, "tokenForCode");
var PLAIN_LABEL = /^[\x21-\x7e]$/;
function isModifierOnlyKey(e) {
  return ["Control", "Meta", "Shift", "Alt", "AltGraph", "CapsLock", "Fn"].includes(e.key);
}
__name(isModifierOnlyKey, "isModifierOnlyKey");
function keyToken(e, byPosition) {
  const fromCode = e.code ? tokenForCode(e.code) : "";
  if (byPosition && fromCode) return fromCode;
  const key = e.key;
  if (key === " ") return "space";
  if (key.length === 1) {
    const codeIsSymbolKey = /^Digit[0-9]$/.test(e.code) || e.code in PUNCTUATION_BY_CODE;
    if (e.shiftKey && codeIsSymbolKey) return fromCode;
    if (PLAIN_LABEL.test(key)) return key === "+" ? "plus" : key.toLowerCase();
    return fromCode || key.toLowerCase();
  }
  if (key === "Dead" || key === "Unidentified" || key === "") return fromCode || "unidentified";
  return key.toLowerCase();
}
__name(keyToken, "keyToken");
function chordFromEvent(e, opts = {}) {
  const isMac = opts.isMac ?? isMacPlatform();
  const parts = [];
  if (isMac) {
    if (e.metaKey) parts.push("mod");
    if (e.ctrlKey) parts.push("ctrl");
  } else if (e.metaKey || e.ctrlKey) {
    parts.push("mod");
  }
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(keyToken(e, opts.byPosition ?? false));
  return parts.join("+");
}
__name(chordFromEvent, "chordFromEvent");
var MODIFIER_ORDER = ["mod", "ctrl", "shift", "alt"];
function normalizeChord(chord, opts = {}) {
  const isMac = opts.isMac ?? isMacPlatform();
  const mods = /* @__PURE__ */ new Set();
  let key = "";
  for (const raw of chord.toLowerCase().split("+")) {
    let t = raw;
    if (t === "cmd" || t === "command" || t === "meta") t = "mod";
    else if (t === "control") t = isMac ? "ctrl" : "mod";
    else if (t === "ctrl" && !isMac) t = "mod";
    else if (t === "option" || t === "opt") t = "alt";
    if (MODIFIER_ORDER.includes(t)) mods.add(t);
    else if (t === " " || t === "spacebar") key = "space";
    else if (t === "esc") key = "escape";
    else if (t === "return") key = "enter";
    else key = t;
  }
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}
__name(normalizeChord, "normalizeChord");
function chordMatches(eventChord, declared, opts = {}) {
  return normalizeChord(eventChord, opts) === normalizeChord(declared, opts);
}
__name(chordMatches, "chordMatches");

export { chordFromEvent, chordMatches, isMacPlatform, isModifierOnlyKey, normalizeChord, tokenForCode };
//# sourceMappingURL=chord.js.map
//# sourceMappingURL=chord.js.map