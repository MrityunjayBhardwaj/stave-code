var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/visualEdit/panels/knobScale.ts
function clamp01(pos) {
  return Math.min(1, Math.max(0, pos));
}
__name(clamp01, "clamp01");
function positionOfValue(value, min, max, scale) {
  if (!Number.isFinite(value) || !(max > min)) return 0;
  if (scale === "log" && min > 0 && value > 0) {
    return clamp01(Math.log(value / min) / Math.log(max / min));
  }
  return clamp01((value - min) / (max - min));
}
__name(positionOfValue, "positionOfValue");
function valueAtPosition(pos, min, max, scale) {
  const t = clamp01(Number.isFinite(pos) ? pos : 0);
  if (scale === "log" && min > 0 && max > min) return min * Math.pow(max / min, t);
  return min + t * (max - min);
}
__name(valueAtPosition, "valueAtPosition");
function snapToStep(value, step) {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}
__name(snapToStep, "snapToStep");

export { positionOfValue, snapToStep, valueAtPosition };
//# sourceMappingURL=knobScale.js.map
//# sourceMappingURL=knobScale.js.map