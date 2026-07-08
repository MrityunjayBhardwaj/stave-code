/**
 * Pure filtering + category derivation for the searchable sound picker (#827).
 * Kept separate from the popover component so the search/category/count logic is
 * unit-testable without React (mirrors the app-side Asset Library `filter.ts`).
 *
 * A "category" is a group's top-level bucket — the group name before ` · `
 * (`Soundfonts · Strings` → `Soundfonts`), or the whole group when it has no
 * separator (`Synths`, or a kit manufacturer like `Roland`). This matches the
 * `<Category> · <sub>` convention the catalogs already use (#807 / Asset Library).
 */

import type { SoundGroup } from './soundCatalog'

/** The top-level category for a group name — the prefix before ` · `, else the
 *  whole name. */
export function soundCategory(group: string): string {
  const i = group.indexOf(' · ')
  return i > 0 ? group.slice(0, i) : group
}

/**
 * The categories present across `groups`, each with its total option count,
 * sorted by count desc then name — drives the picker's category chips. Groups
 * sharing a category (e.g. `Soundfonts · Strings` + `Soundfonts · Brass`) are
 * summed into one `Soundfonts` chip.
 */
export function categoryCounts(groups: SoundGroup[]): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const g of groups) {
    const c = soundCategory(g.group)
    counts.set(c, (counts.get(c) ?? 0) + g.options.length)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
}

/** Total option count across all groups (the "All" chip count). */
export function totalOptions(groups: SoundGroup[]): number {
  return groups.reduce((n, g) => n + g.options.length, 0)
}

/**
 * Filter groups by a search query (case-insensitive substring over each
 * option's label OR value) and an optional category. Empty groups are dropped.
 * A blank query + null category returns the groups unchanged (same references).
 */
export function filterGroups(
  groups: SoundGroup[],
  query: string,
  category: string | null,
): SoundGroup[] {
  const q = query.trim().toLowerCase()
  if (!q && !category) return groups
  const out: SoundGroup[] = []
  for (const g of groups) {
    if (category && soundCategory(g.group) !== category) continue
    const options = q
      ? g.options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        )
      : g.options
    if (options.length) out.push({ group: g.group, options })
  }
  return out
}
