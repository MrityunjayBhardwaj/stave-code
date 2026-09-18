var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/ir/trackId.ts
function trackIdFromLabel(label, index) {
  return namedIdOf(label) ?? `d${index + 1}`;
}
__name(trackIdFromLabel, "trackIdFromLabel");
function namedIdOf(label) {
  const bare = label === void 0 ? void 0 : splitMuteMarker(label).bare;
  return bare && bare !== "$" ? bare : null;
}
__name(namedIdOf, "namedIdOf");
function splitMuteMarker(label) {
  const prefix = label.startsWith("_");
  const rest = prefix ? label.slice(1) : label;
  const suffix = rest.endsWith("_");
  return { bare: suffix ? rest.slice(0, -1) : rest, prefix, suffix };
}
__name(splitMuteMarker, "splitMuteMarker");
function trackIdsFromLabels(labels, commented = []) {
  const claimed = labels.map(namedIdOf);
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

export { isMutedLabel, splitMuteMarker, trackIdFromLabel, trackIdsFromLabels };
//# sourceMappingURL=trackId.js.map
//# sourceMappingURL=trackId.js.map