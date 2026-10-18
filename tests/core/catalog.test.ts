import { afterEach, describe, expect, it } from 'vitest';
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
        id: 'palette', title: 'Палитра', description: 'описание', category: 'graphics',
        layer: 'base', dir: path.join(root, 'catalog', 'samples', 'palette'),
      },
      {
        id: 'icons', title: 'Свои иконки', description: 'описание', category: 'graphics',
        layer: 'base', dir: path.join(root, 'catalog', 'samples', 'icons'),
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
      loadCatalog({ baseCatalogDir: path.join(root, 'none'), userDir: root, cacheDir: root, vscodeStorage: '' }),
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
    expect(c.skills.find((s) => s.id === 'ghost')).toMatchObject({ dir: null, error: 'SKILL.md не найден' });
    expect(c.skills.find((s) => s.id === 'evil')).toMatchObject({
      dir: null, error: expect.stringMatching(/за пределы/),
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
    expect(c.skills.find((s) => s.id === 'far')).toMatchObject({ dir: null, error: 'Источник недоступен' });
    expect(c.skills.find((s) => s.id === 'palette')?.dir).not.toBeNull();
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
      dir: path.join(root, '.cache', 'base-remote', 'far'), title: 'Далёкий',
    });
    expect(c.errors).toEqual(['Источник «remote» (базовый): не удалось обновить — сеть недоступна']);
  });
});
