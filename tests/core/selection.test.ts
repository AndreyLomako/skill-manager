import { describe, expect, it } from 'vitest';
import {
  agentsOf,
  clientPathKey,
  countByCategory,
  defaultAgentChoice,
  MY_SKILLS,
  mergeInstalled,
  pruneSelection,
  skillsForCategory,
  sourcesLabel,
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

describe('агенты', () => {
  it('agentsOf', () => {
    expect(agentsOf('claude')).toEqual(['claude']);
    expect(agentsOf('both')).toEqual(['claude', 'codex']);
  });

  it('defaultAgentChoice', () => {
    expect(defaultAgentChoice(null)).toBe('claude');
    expect(defaultAgentChoice(['codex'])).toBe('codex');
    expect(defaultAgentChoice(['codex', 'manual'])).toBe('codex');
    expect(defaultAgentChoice(['vscode', 'codex'])).toBe('claude');
    expect(defaultAgentChoice([])).toBe('claude');
  });

  it('mergeInstalled', () => {
    const states = {
      claude: { a: 'up-to-date', b: 'outdated', c: 'up-to-date', d: 'unknown' } as const,
      codex: { a: 'up-to-date', b: 'up-to-date', d: 'unknown' } as const,
    };
    expect(mergeInstalled(states, ['claude', 'codex'])).toEqual({ a: 'up-to-date', b: 'outdated', d: 'unknown' });
    expect(mergeInstalled(states, ['claude'])).toEqual(states.claude);
    expect(mergeInstalled({}, ['codex'])).toEqual({});
  });

  it('mergeInstalled не берёт унаследованные свойства (constructor)', () => {
    const states = { claude: { constructor: 'up-to-date' } as const, codex: {} };
    expect(mergeInstalled(states, ['claude', 'codex'])).toEqual({});
  });

  it('sourcesLabel', () => {
    expect(sourcesLabel(['vscode', 'claude', 'codex', 'manual'])).toBe('VS Code · Claude · Codex · вручную');
    expect(sourcesLabel([])).toBe('');
  });
});

describe('clientPathKey', () => {
  const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Electron/44 Safari/537.36';
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Electron/44';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Electron/44';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140 Mobile';

  it('Linux: регистр значим', () => {
    expect(clientPathKey('/home/u/App', LINUX)).toBe('/home/u/App');
    expect(clientPathKey('/home/u/App', LINUX)).not.toBe(clientPathKey('/home/u/app', LINUX));
  });

  it.each([WIN, MAC, ANDROID, ''])('не Linux («%s»): нижний регистр', (ua) => {
    expect(clientPathKey('C:\Work\App', ua)).toBe('c:\work\app');
  });
});
