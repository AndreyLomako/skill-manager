import { describe, expect, it } from 'vitest';
import {
  countByCategory,
  MY_SKILLS,
  pruneSelection,
  skillsForCategory,
  summarizeByCategory,
  toggleSelection,
} from '../../src/core/selection';
import type { CatalogSkill } from '../../src/core/types';

const skills: CatalogSkill[] = [
  { id: 'a', title: 'A', description: '', category: 'graphics', layer: 'base', dir: 'x' },
  { id: 'b', title: 'B', description: '', category: 'video', layer: 'user', dir: 'x' },
  { id: 'c', title: 'C', description: '', category: 'video', layer: 'base', dir: null, error: 'e' },
];
const categories = [
  { id: 'graphics', title: 'Графика' },
  { id: 'video', title: 'Видео' },
];

describe('selection', () => {
  it('toggleSelection добавляет и убирает', () => {
    expect(toggleSelection([], 'a')).toEqual(['a']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('skillsForCategory: обычная категория и «Мои скиллы»', () => {
    expect(skillsForCategory(skills, 'video').map((s) => s.id)).toEqual(['b', 'c']);
    expect(skillsForCategory(skills, MY_SKILLS).map((s) => s.id)).toEqual(['b']);
  });

  it('countByCategory считает категории и «Мои скиллы»', () => {
    expect(countByCategory(['a', 'b'], skills)).toEqual({ graphics: 1, video: 1, [MY_SKILLS]: 1 });
  });

  it('pruneSelection убирает пропавшие и недоступные', () => {
    expect(pruneSelection(['a', 'c', 'zzz'], skills)).toEqual(['a']);
  });

  it('summarizeByCategory в порядке категорий', () => {
    expect(summarizeByCategory([skills[1], skills[0]], categories)).toBe('Графика 1 · Видео 1');
  });
});
