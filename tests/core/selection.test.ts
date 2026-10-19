import { describe, expect, it } from 'vitest';
import {
  agentsOf,
  categoryPath,
  childCategories,
  groupInstalled,
  packsForCategory,
  packState,
  togglePack,
  topCategories,
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
import type { CatalogSkill, InstalledSkill } from '../../src/core/types';
import { catalogSkill } from '../helpers/skill';

const skills: CatalogSkill[] = [
  catalogSkill({ id: 'a', title: 'A', category: 'graphics', dir: 'x' }),
  catalogSkill({ id: 'b', title: 'B', category: 'video', layer: 'user', dir: 'x' }),
  catalogSkill({ id: 'c', title: 'C', category: 'video', error: 'e' }),
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

describe('selection: подкатегории и паки', () => {
  const cats = [
    { id: 'design', title: 'Дизайн', order: 1 },
    { id: 'video', title: 'Видео', order: 2 },
    { id: 'cut', title: 'Монтаж', parent: 'video', order: 1 },
    { id: 'gen', title: 'Генерация', parent: 'video', order: 2 },
  ];
  const sk = [
    catalogSkill({ id: 'imp', category: 'design', dir: 'x' }),
    catalogSkill({ id: 'p1', category: 'cut', dir: 'x', pack: 'pk' }),
    catalogSkill({ id: 'p2', category: 'cut', dir: 'x', pack: 'pk' }),
    catalogSkill({ id: 'p3', category: 'cut', pack: 'pk', error: 'e' }),
    catalogSkill({ id: 'solo', category: 'cut', dir: 'x' }),
  ];
  const pack = { id: 'pk', title: 'Пак', category: 'cut', summary: '', skills: ['p1', 'p2', 'p3'], layer: 'base' as const };

  it('topCategories, childCategories, categoryPath', () => {
    expect(topCategories(cats).map((c) => c.id)).toEqual(['design', 'video']);
    expect(childCategories(cats, 'video').map((c) => c.id)).toEqual(['cut', 'gen']);
    expect(childCategories(cats, 'design')).toEqual([]);
    expect(categoryPath(cats, 'cut')).toBe('Видео › Монтаж');
    expect(categoryPath(cats, 'design')).toBe('Дизайн');
    expect(categoryPath(cats, 'nope')).toBe('nope');
  });

  it('skillsForCategory не показывает скиллы пака; packsForCategory', () => {
    expect(skillsForCategory(sk, 'cut').map((s) => s.id)).toEqual(['solo']);
    expect(packsForCategory([pack], 'cut')).toEqual([pack]);
    expect(packsForCategory([pack], 'gen')).toEqual([]);
  });

  it('countByCategory суммирует подкатегории на родителе', () => {
    expect(countByCategory(['p1', 'solo', 'imp'], sk, cats)).toEqual({ cut: 2, video: 2, design: 1 });
  });

  it('summarizeByCategory пишет путь подкатегории', () => {
    expect(summarizeByCategory([sk[1], sk[4], sk[0]], cats)).toBe('Дизайн 1 · Видео › Монтаж 2');
  });

  it('packState: недоступные не считаются; всё установлено — installed', () => {
    expect(packState(pack, [], {}, sk)).toBe('none');
    expect(packState(pack, ['p1'], {}, sk)).toBe('some');
    expect(packState(pack, ['p1', 'p2'], {}, sk)).toBe('all');
    expect(packState(pack, ['p2'], { p1: 'up-to-date' }, sk)).toBe('all');
    expect(packState(pack, [], { p1: 'up-to-date', p2: 'outdated' }, sk)).toBe('installed');
  });

  it('togglePack: добавляет доступные неустановленные, повторно — снимает все', () => {
    expect(togglePack(['imp'], pack, sk, { p1: 'up-to-date' })).toEqual(['imp', 'p2']);
    expect(togglePack(['imp', 'p2'], pack, sk, { p1: 'up-to-date' })).toEqual(['imp']);
    expect(togglePack(['p1'], pack, sk, {})).toEqual(['p1', 'p2']);
  });

  it('groupInstalled: сначала без пака, затем группы паков с найденными скиллами', () => {
    const item = (name: string, kind: InstalledSkill['kind'] = 'managed') =>
      ({ name, title: name, description: '', agent: 'claude', kind, dir: name, root: 'r' }) as InstalledSkill;
    const groups = groupInstalled([item('p2'), item('imp'), item('p1'), item('p1', 'plugin')], sk, [pack]);
    expect(groups.map((g) => [g.pack?.id ?? null, g.items.map((i) => `${i.kind}:${i.name}`)])).toEqual([
      [null, ['managed:imp', 'plugin:p1']],
      ['pk', ['managed:p2', 'managed:p1']],
    ]);
    expect(groupInstalled([item('imp')], sk, [pack]).map((g) => g.pack?.id ?? null)).toEqual([null]);
  });
});
