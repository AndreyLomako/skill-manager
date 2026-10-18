import type { CatalogSkill, CategoryDef } from './types';

export const MY_SKILLS = '__my__';

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export function skillsForCategory(skills: readonly CatalogSkill[], categoryId: string): CatalogSkill[] {
  return skills.filter((s) => (categoryId === MY_SKILLS ? s.layer === 'user' : s.category === categoryId));
}

export function countByCategory(
  selected: readonly string[],
  skills: readonly CatalogSkill[],
): Record<string, number> {
  const set = new Set(selected);
  const counts: Record<string, number> = {};
  for (const s of skills) {
    if (!set.has(s.id)) continue;
    counts[s.category] = (counts[s.category] ?? 0) + 1;
    if (s.layer === 'user') counts[MY_SKILLS] = (counts[MY_SKILLS] ?? 0) + 1;
  }
  return counts;
}

export function pruneSelection(selected: readonly string[], skills: readonly CatalogSkill[]): string[] {
  const available = new Set(skills.filter((s) => s.dir).map((s) => s.id));
  return selected.filter((id) => available.has(id));
}

export function summarizeByCategory(
  selected: readonly CatalogSkill[],
  categories: readonly CategoryDef[],
): string {
  const counts = new Map<string, number>();
  for (const s of selected) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return categories
    .filter((c) => counts.has(c.id))
    .map((c) => `${c.title} ${counts.get(c.id)}`)
    .join(' · ');
}
