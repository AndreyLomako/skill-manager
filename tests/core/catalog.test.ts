import { afterEach, describe, expect, it } from 'vitest';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CatalogError, loadCatalog } from '../../src/core/catalog';
import type { AppPaths } from '../../src/core/paths';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const skillMd = (name: string) => `---\nname: ${name}\ndescription: описание\n---\n`;

const base = {
  version: 1,
  categories: [
    { id: 'video', title: 'Видео', order: 2 },
    { id: 'graphics', title: 'Графика', order: 1 },
  ],
  sources: [{ id: 'samples', type: 'local', path: './samples' }],
  skills: [
    { id: 'palette', source: 'samples', path: 'palette', category: 'graphics' },
    { id: 'icons', source: 'samples', path: 'icons', category: 'graphics', title: 'Свои иконки' },
  ],
};

async function setup(baseManifest: object, user?: object | string, extra: Record<string, string> = {}) {
  const root = await tmpDir();
  const paths: AppPaths = {
    baseCatalogDir: path.join(root, 'catalog'),
    userDir: path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage: path.join(root, 'storage.json'),
    home: root,
    trashDir: path.join(root, 'user', 'trash'),
  };
  await writeFiles(root, {
    'catalog/catalog.json': JSON.stringify(baseManifest),
    'catalog/samples/palette/SKILL.md': skillMd('Палитра'),
    'catalog/samples/icons/SKILL.md': skillMd('Иконки'),
    ...(user === undefined
      ? {}
      : { 'user/user-catalog.json': typeof user === 'string' ? user : JSON.stringify(user) }),
    ...extra,
  });
  return { root, paths };
}

describe('loadCatalog', () => {
  it('базовый слой: название из SKILL.md, переопределение из манифеста, порядок категорий', async () => {
    const { root, paths } = await setup(base);
    const c = await loadCatalog(paths);
    expect(c.categories.map((x) => x.id)).toEqual(['graphics', 'video']);
    expect(c.skills).toEqual([
      {
        id: 'palette', title: 'Палитра', description: 'описание', summary: 'описание', category: 'graphics',
        layer: 'base', dirs: { claude: path.join(root, 'catalog', 'samples', 'palette'), codex: path.join(root, 'catalog', 'samples', 'palette') },
        commands: [], commandsMore: 0, sourceLabel: 'папка: ./samples',
      },
      {
        id: 'icons', title: 'Свои иконки', description: 'описание', summary: 'описание', category: 'graphics',
        layer: 'base', dirs: { claude: path.join(root, 'catalog', 'samples', 'icons'), codex: path.join(root, 'catalog', 'samples', 'icons') },
        commands: [], commandsMore: 0, sourceLabel: 'папка: ./samples',
      },
    ]);
    expect(c.errors).toEqual([]);
  });

  it('пользовательский слой перекрывает базовый по id и добавляет категории', async () => {
    const { paths } = await setup(
      base,
      {
        version: 1,
        categories: [{ id: 'mine', title: 'Моё' }],
        sources: [{ id: 'local', type: 'local', path: './skills' }],
        skills: [{ id: 'palette', source: 'local', path: 'palette2', category: 'mine' }],
      },
      { 'user/skills/palette2/SKILL.md': skillMd('Моя палитра') },
    );
    const c = await loadCatalog(paths);
    expect(c.skills.find((s) => s.id === 'palette')).toMatchObject({
      layer: 'user', title: 'Моя палитра', category: 'mine',
    });
    expect(c.categories.map((x) => x.id)).toContain('mine');
    expect(c.skills).toHaveLength(2);
  });

  it('битый пользовательский файл не ломает базовый слой', async () => {
    const { paths } = await setup(base, '{oops');
    const c = await loadCatalog(paths);
    expect(c.skills).toHaveLength(2);
    expect(c.errors[0]).toMatch(/Мой каталог/);
  });

  it('нет базового каталога — CatalogError', async () => {
    const root = await tmpDir();
    await expect(
      loadCatalog({ baseCatalogDir: path.join(root, 'none'), userDir: root, cacheDir: root, vscodeStorage: '', home: root, trashDir: path.join(root, 'user', 'trash') }),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it('помечает скилл без SKILL.md и путь за пределами источника', async () => {
    const { paths } = await setup({
      ...base,
      skills: [
        { id: 'ghost', source: 'samples', path: 'ghost', category: 'graphics' },
        { id: 'evil', source: 'samples', path: '../../..', category: 'graphics' },
      ],
    });
    const c = await loadCatalog(paths);
    expect(c.skills.find((s) => s.id === 'ghost')).toMatchObject({ dirs: {}, error: 'SKILL.md не найден' });
    expect(c.skills.find((s) => s.id === 'evil')).toMatchObject({
      dirs: {}, error: expect.stringMatching(/за пределы/),
    });
  });

  it('ошибка git-источника помечает его скиллы, остальные работают', async () => {
    const { paths } = await setup({
      ...base,
      sources: [...base.sources, { id: 'remote', type: 'git', url: 'https://example.invalid/r.git' }],
      skills: [...base.skills, { id: 'far', source: 'remote', path: '', category: 'video' }],
    });
    const failingGit = async () => {
      throw new Error('сеть недоступна');
    };
    const c = await loadCatalog(paths, {}, failingGit);
    expect(c.skills.find((s) => s.id === 'far')).toMatchObject({ dirs: {}, error: 'Источник недоступен' });
    expect(c.skills.find((s) => s.id === 'palette')?.dirs.claude).toBeTruthy();
    expect(c.errors[0]).toMatch(/remote.*сеть недоступна/);
  });

  it('неизвестная категория скилла добавляется автоматически', async () => {
    const { paths } = await setup({
      ...base,
      skills: [{ id: 'palette', source: 'samples', path: 'palette', category: 'misc' }],
    });
    expect((await loadCatalog(paths)).categories.map((c) => c.id)).toContain('misc');
  });

  it('неудачное обновление git-источника: скилл остаётся доступным, предупреждение в errors', async () => {
    const { root, paths } = await setup(
      {
        ...base,
        sources: [...base.sources, { id: 'remote', type: 'git', url: 'https://example.invalid/r.git' }],
        skills: [...base.skills, { id: 'far', source: 'remote', path: 'far', category: 'video' }],
      },
      undefined,
      { '.cache/base-remote/.git/HEAD': 'ref: refs/heads/main', '.cache/base-remote/far/SKILL.md': skillMd('Далёкий') },
    );
    const failingGit = async () => {
      throw new Error('сеть недоступна');
    };
    const c = await loadCatalog(paths, { update: true }, failingGit);
    expect(c.skills.find((s) => s.id === 'far')).toMatchObject({
      dirs: { claude: path.join(root, '.cache', 'base-remote', 'far'), codex: path.join(root, '.cache', 'base-remote', 'far') }, title: 'Далёкий',
    });
    expect(c.errors).toEqual(['Источник «remote» (базовый): не удалось обновить — сеть недоступна']);
  });
});

describe('loadCatalog: каталог v2', () => {
  const v2 = (o: object) => ({
    version: 1,
    categories: [],
    sources: [{ id: 'samples', type: 'local', path: './samples' }],
    skills: [],
    ...o,
  });

  it('paths по агентам: у каждого агента своя копия; описание — из копии Claude', async () => {
    const { root, paths } = await setup(
      v2({ skills: [{ id: 'imp', source: 'samples', category: 'design', paths: { claude: 'c/imp', codex: 'a/imp' } }] }),
      undefined,
      { 'catalog/samples/c/imp/SKILL.md': skillMd('Imp C'), 'catalog/samples/a/imp/SKILL.md': skillMd('Imp A') },
    );
    const s = (await loadCatalog(paths)).skills[0];
    expect(s.dirs).toEqual({
      claude: path.join(root, 'catalog', 'samples', 'c', 'imp'),
      codex: path.join(root, 'catalog', 'samples', 'a', 'imp'),
    });
    expect(s.title).toBe('Imp C');
    expect(s.error).toBeUndefined();
  });

  it('нет копии для агента — агента нет в dirs; нет ни одной — ошибка', async () => {
    const { paths } = await setup(
      v2({
        skills: [
          { id: 'only-c', source: 'samples', category: 'd', paths: { claude: 'c/x' } },
          { id: 'half', source: 'samples', category: 'd', paths: { claude: 'c/x', codex: 'a/missing' } },
          { id: 'none', source: 'samples', category: 'd', paths: { claude: 'nope', codex: 'nope2' } },
        ],
      }),
      undefined,
      { 'catalog/samples/c/x/SKILL.md': skillMd('X') },
    );
    const c = await loadCatalog(paths);
    const by = (id: string) => c.skills.find((s) => s.id === id)!;
    expect(Object.keys(by('only-c').dirs)).toEqual(['claude']);
    expect(Object.keys(by('half').dirs)).toEqual(['claude']);
    expect(by('half').error).toBeUndefined();
    expect(by('none')).toMatchObject({ dirs: {}, error: 'SKILL.md не найден' });
  });

  it('summary: из манифеста, иначе description манифеста, иначе frontmatter; команды и homepage', async () => {
    const { paths } = await setup(
      v2({
        skills: [
          {
            id: 'a', source: 'samples', path: 'palette', category: 'd', summary: 'Кратко',
            commands: [{ cmd: '/a x', hint: 'h' }], commandsMore: 4, homepage: 'https://a.dev',
          },
          { id: 'b', source: 'samples', path: 'palette', category: 'd', description: 'Из манифеста' },
          { id: 'c', source: 'samples', path: 'palette', category: 'd' },
        ],
      }),
    );
    const c = await loadCatalog(paths);
    const by = (id: string) => c.skills.find((s) => s.id === id)!;
    expect(by('a')).toMatchObject({
      summary: 'Кратко', commands: [{ cmd: '/a x', hint: 'h' }], commandsMore: 4, homepage: 'https://a.dev',
    });
    expect(by('b').summary).toBe('Из манифеста');
    expect(by('c').summary).toBe('описание');
  });

  it('паки попадают в каталог с layer, у скиллов пака проставлен pack', async () => {
    const { paths } = await setup(
      v2({
        categories: [{ id: 'cut', title: 'Монтаж' }],
        skills: [
          { id: 'palette', source: 'samples', path: 'palette', category: 'cut' },
          { id: 'icons', source: 'samples', path: 'icons', category: 'cut' },
        ],
        packs: [{ id: 'p', title: 'Пак', category: 'cut', summary: 'S', skills: ['palette', 'icons'] }],
      }),
    );
    const c = await loadCatalog(paths);
    expect(c.packs).toEqual([
      { id: 'p', title: 'Пак', category: 'cut', summary: 'S', skills: ['palette', 'icons'], layer: 'base' },
    ]);
    expect(c.skills.every((s) => s.pack === 'p')).toBe(true);
  });

  it('скилл и пак в категории с подкатегориями попадают в первую подкатегорию', async () => {
    const { paths } = await setup(
      v2({
        categories: [
          { id: 'video', title: 'Видео' },
          { id: 'gen', title: 'Генерация', parent: 'video', order: 2 },
          { id: 'cut', title: 'Монтаж', parent: 'video', order: 1 },
        ],
        skills: [
          { id: 'palette', source: 'samples', path: 'palette', category: 'video' },
          { id: 'icons', source: 'samples', path: 'icons', category: 'video' },
        ],
        packs: [{ id: 'p', title: 'Пак', category: 'video', skills: ['icons'] }],
      }),
    );
    const c = await loadCatalog(paths);
    expect(c.skills.map((s) => [s.id, s.category, s.error])).toEqual([
      ['palette', 'cut', undefined],
      ['icons', 'cut', undefined],
    ]);
    expect(c.packs[0].category).toBe('cut');
    expect(c.categories.find((x) => x.id === 'cut')?.parent).toBe('video');
  });

  it('user-catalog.json из v0.2.1: «graphics» → «Дизайн», «video» → первая подкатегория', async () => {
    const { paths } = await setup(
      v2({
        categories: [
          { id: 'design', title: 'Дизайн', order: 1 },
          { id: 'video', title: 'Видео', order: 2 },
          { id: 'video-editing', title: 'Монтаж', parent: 'video', order: 1 },
          { id: 'video-generation', title: 'Генерация', parent: 'video', order: 2 },
        ],
      }),
      {
        version: 1,
        categories: [],
        sources: [{ id: 'mine', type: 'local', path: './mine' }],
        skills: [
          { id: 'old-graphics', source: 'mine', path: 'a', category: 'graphics' },
          { id: 'old-video', source: 'mine', path: 'b', category: 'video' },
        ],
      },
      { 'user/mine/a/SKILL.md': skillMd('A'), 'user/mine/b/SKILL.md': skillMd('B') },
    );
    const c = await loadCatalog(paths);
    expect(c.skills.map((s) => [s.id, s.category, s.error])).toEqual([
      ['old-graphics', 'design', undefined],
      ['old-video', 'video-editing', undefined],
    ]);
    expect(c.categories.map((x) => x.id)).not.toContain('graphics');
    expect(c.errors).toEqual([]);
  });

  it('своя категория «graphics» в user-catalog.json не переименовывается', async () => {
    const { paths } = await setup(
      v2({ categories: [{ id: 'design', title: 'Дизайн' }] }),
      {
        version: 1,
        categories: [{ id: 'graphics', title: 'Моя графика' }],
        sources: [{ id: 'mine', type: 'local', path: './mine' }],
        skills: [{ id: 'g', source: 'mine', path: 'a', category: 'graphics' }],
      },
      { 'user/mine/a/SKILL.md': skillMd('A') },
    );
    const c = await loadCatalog(paths);
    expect(c.skills[0].category).toBe('graphics');
  });

  it('git-источник получает sparse — пути всех его скиллов (по агентам)', async () => {
    const { paths } = await setup(
      v2({
        sources: [{ id: 'remote', type: 'git', url: 'https://example.invalid/r.git' }],
        skills: [
          { id: 'imp', source: 'remote', category: 'd', paths: { claude: '.claude/skills/imp', codex: '.agents/skills/imp' } },
          { id: 'two', source: 'remote', path: 'skills/two', category: 'd' },
        ],
      }),
    );
    const calls: string[][] = [];
    const fake = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'clone') await mkdir(path.join(args[args.length - 1], '.git'), { recursive: true });
    };
    await loadCatalog(paths, {}, fake);
    const set = calls.find((a) => a[0] === 'sparse-checkout');
    expect(set?.slice(-3)).toEqual(['/.agents/skills/imp/', '/.claude/skills/imp/', '/skills/two/']);
    expect(calls[0]).toContain('--sparse');
  });

  it('sourceLabel: git — адрес без .git', async () => {
    const { paths } = await setup(
      v2({
        sources: [{ id: 'remote', type: 'git', url: 'https://github.com/o/r.git' }],
        skills: [{ id: 'far', source: 'remote', path: 'far', category: 'd' }],
      }),
      undefined,
      { '.cache/base-remote/.git/HEAD': 'ref: refs/heads/main', '.cache/base-remote/far/SKILL.md': skillMd('Far') },
    );
    const noop = async () => {};
    expect((await loadCatalog(paths, {}, noop)).skills[0].sourceLabel).toBe('https://github.com/o/r');
  });
});

describe('loadCatalog: без клонирования (первая отрисовка)', () => {
  it('clone: false — git не клонируется, скиллы источника помечены pending; с кэшем — работают', async () => {
    const { paths } = await setup(
      {
        version: 1,
        sources: [
          { id: 'remote', type: 'git', url: 'https://example.invalid/r.git' },
          { id: 'cached', type: 'git', url: 'https://example.invalid/c.git' },
        ],
        skills: [
          { id: 'far', source: 'remote', path: 'far', category: 'd' },
          { id: 'near', source: 'cached', path: 'near', category: 'd' },
        ],
      },
      undefined,
      { '.cache/base-cached/.git/HEAD': 'ref: refs/heads/main', '.cache/base-cached/near/SKILL.md': skillMd('Near') },
    );
    const calls: string[][] = [];
    const git = async (args: string[]) => {
      calls.push(args);
    };
    const c = await loadCatalog(paths, { clone: false }, git);
    expect(calls.filter((a) => a[0] === 'clone')).toEqual([]);
    expect(c.skills.find((s) => s.id === 'far')).toMatchObject({ pending: true, error: 'Загружается…', dirs: {} });
    expect(c.skills.find((s) => s.id === 'near')?.dirs.claude).toBeTruthy();
    expect(c.errors).toEqual([]);
  });
});
