import type { CropRegion } from "@stave/editor";

/**
 * #1435 — per-viz-file backdrop crops.
 *
 * A crop rectangle is chosen for ONE sketch's aspect ratio, so it belongs to
 * that viz file and nothing else. It used to live on `ProjectMeta.backgroundCrop`
 * — one crop per project — which meant swapping the pinned backdrop carried the
 * previous sketch's crop onto the new one unchanged, while the popup's own toast
 * ("Backdrop crop saved for …") named the file it was supposedly saved for.
 *
 * This finishes the move #347 and #371 started for the backdrop *file*: that is
 * already per-tab, in this same localStorage, keyed by project
 * (`stave:perTabBackdrop:${projectId}` in StrudelEditorClient). The crop now
 * sits beside it in the same shape.
 *
 * ⚠ localStorage, not the Y.Doc — deliberately. A crop is a per-user VIEW
 * preference, not authored content; `ProjectMeta` was kept outside the Y.Doc for
 * exactly this reason, and moving the bytes into the doc alongside the inline
 * zone crops would start syncing one collaborator's framing to everyone in the
 * room. Per-file KEYING is what the zone-crop design argues for; it is not an
 * argument about where the bytes live.
 *
 * Best-effort throughout: a private window, cleared site data, or a quota
 * failure degrades to "no crop", never to a throw on the render path.
 */

export type BackdropCropMap = ReadonlyMap<string, CropRegion>;

export function backdropCropsKey(projectId: string): string {
  return `stave:backdropCrops:${projectId}`;
}

/** Every stored crop for a project, keyed by viz FILE id. Empty when absent. */
export function loadBackdropCrops(projectId: string): Map<string, CropRegion> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(backdropCropsKey(projectId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out = new Map<string, CropRegion>();
    for (const [fileId, value] of Object.entries(parsed)) {
      const c = asCropRegion(value);
      if (c) out.set(fileId, c);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function saveBackdropCrops(
  projectId: string,
  crops: BackdropCropMap,
): void {
  if (typeof window === "undefined") return;
  try {
    if (crops.size === 0) {
      window.localStorage.removeItem(backdropCropsKey(projectId));
      return;
    }
    window.localStorage.setItem(
      backdropCropsKey(projectId),
      JSON.stringify(Object.fromEntries(crops)),
    );
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Set (or, with `null`, remove) one file's crop and persist the result.
 * Returns the NEW map rather than mutating the one passed in, so React state
 * updates stay referentially honest.
 */
export function withBackdropCrop(
  projectId: string,
  crops: BackdropCropMap,
  fileId: string,
  crop: CropRegion | null,
): Map<string, CropRegion> {
  const next = new Map(crops);
  if (crop == null) next.delete(fileId);
  else next.set(fileId, crop);
  saveBackdropCrops(projectId, next);
  return next;
}

/**
 * A stored value only counts as a crop if all four numbers are finite and the
 * rect has area. A malformed entry (hand-edited storage, a half-written value,
 * a shape from a future version) is dropped rather than propagated into the
 * transform math, where `NaN` would blank the backdrop with no error.
 */
function asCropRegion(value: unknown): CropRegion | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const nums = [v.x, v.y, v.w, v.h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const [x, y, w, h] = nums as number[];
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}
