/**
 * Pure windowing math for the asset list — extracted so the clamp that guards
 * against a blank render (F2) is unit-testable without React/DOM.
 *
 * Maps a scroll offset + viewport height to the slice of fixed-height rows to
 * render (with overscan). The critical invariant: when `total > 0` the returned
 * range is always non-empty (`first < last`), even if `scrollTop` is stale and
 * points past the (possibly just-shrunk) content — otherwise `slice(first,last)`
 * with `first > last` yields `[]` and the list paints blank.
 */

export interface WindowRange {
  first: number;
  last: number;
}

export function computeWindow(
  total: number,
  scrollTop: number,
  viewportH: number,
  rowHeight: number,
  overscan: number,
): WindowRange {
  if (total <= 0) return { first: 0, last: 0 };
  const visibleCount = Math.ceil(viewportH / rowHeight) + overscan * 2;
  const maxFirst = Math.max(0, total - visibleCount);
  const first = Math.min(
    maxFirst,
    Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
  );
  const last = Math.min(total, first + visibleCount);
  return { first, last };
}
