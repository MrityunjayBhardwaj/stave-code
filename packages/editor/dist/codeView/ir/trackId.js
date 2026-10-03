var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/codeView/ir/trackId.ts
function trackIdFromLabel(label, index) {
  return labelName(label) ?? `d${index + 1}`;
}
__name(trackIdFromLabel, "trackIdFromLabel");
var IDENTIFIER = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*`;
var WHOLE_IDENTIFIER = new RegExp(`^${IDENTIFIER}$`, "u");
function isIdentifier(text) {
  return WHOLE_IDENTIFIER.test(text);
}
__name(isIdentifier, "isIdentifier");
var LABEL_HEAD = new RegExp(`^(${IDENTIFIER})\\s*:`, "u");
function labelName(label) {
  const bare = label == null ? void 0 : splitMuteMarker(label).bare;
  return bare && bare !== "$" ? bare : null;
}
__name(labelName, "labelName");
function labelAtOffset(code, offset) {
  if (!Number.isFinite(offset) || offset < 0 || offset >= code.length) return null;
  let i = offset;
  while (i < code.length && /\s/.test(code[i])) i++;
  const m = LABEL_HEAD.exec(code.slice(i));
  return m ? labelName(m[1]) : null;
}
__name(labelAtOffset, "labelAtOffset");
function sectionNameAt(code, range) {
  const [start, end] = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end > code.length || end <= start) return null;
  let text = code.slice(start, end).trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    const comma = text.indexOf(",");
    if (comma < 0) return null;
    text = text.slice(comma + 1, -1).trim();
  }
  return isIdentifier(text) ? text : null;
}
__name(sectionNameAt, "sectionNameAt");
function splitMuteMarker(label) {
  const prefix = label.startsWith("_");
  const rest = prefix ? label.slice(1) : label;
  const suffix = rest.endsWith("_");
  return { bare: suffix ? rest.slice(0, -1) : rest, prefix, suffix };
}
__name(splitMuteMarker, "splitMuteMarker");
function trackIdsFromLabels(labels, commented = []) {
  const claimed = labels.map(labelName);
  const taken = /* @__PURE__ */ new Set();
  for (let i = 0; i < claimed.length; i++) {
    const id = claimed[i];
    if (id !== null && !commented[i]) taken.add(id);
  }
  const named = claimed.map((id, i) => {
    if (id === null || !commented[i]) return id;
    if (taken.has(id)) return null;
    taken.add(id);
    return id;
  });
  return named.map((id, index) => {
    if (id !== null) return id;
    let n = index + 1;
    while (taken.has(`d${n}`)) n++;
    taken.add(`d${n}`);
    return `d${n}`;
  });
}
__name(trackIdsFromLabels, "trackIdsFromLabels");
function isMutedLabel(label) {
  if (label === void 0) return false;
  const { prefix, suffix } = splitMuteMarker(label);
  return prefix || suffix;
}
__name(isMutedLabel, "isMutedLabel");

export { LABEL_HEAD, isIdentifier, isMutedLabel, labelAtOffset, labelName, sectionNameAt, splitMuteMarker, trackIdFromLabel, trackIdsFromLabels };
//# sourceMappingURL=trackId.js.map
//# sourceMappingURL=trackId.js.map