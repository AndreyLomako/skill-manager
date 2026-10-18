import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  addManualProject,
  isKnownProject,
  listProjects,
  loadSettings,
  mergeProjects,
  rememberOpen,
} from '../../src/core/projects';
import type { AppPaths } from '../../src/core/paths';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const running = async () => true;
const stopped = async () => false;

async function setup() {
  const root = await tmpDir();
  const paths: AppPaths = {
    baseCatalogDir: path.join(root, 'catalog'),
    userDir: path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage: path.join(root, 'storage.json'),
  };
  await writeFiles(root, {
    'storage.json': JSON.stringify({
      windowsState: {
        lastActiveWindow: { folder: 'file:///c%3A/work/a' },
        openedWindows: [{ folder: 'file:///c%3A/work/a' }],
      },
    }),
  });
  return { root, paths };
}

describe('mergeProjects', () => {
  it('активный первым, затем открытые, недавние и ручные без дублей', () => {
    const res = mergeProjects(
      { open: ['C:\\a', 'C:\\b'], active: 'C:\\b' },
      { recent: ['c:\\A', 'C:\\old'], manual: ['C:\\man', 'C:\\old'] },
    );
    expect(res).toEqual([
      { path: 'C:\\b', name: 'b', open: true, active: true },
      { path: 'C:\\a', name: 'a', open: true, active: false },
      { path: 'C:\\old', name: 'old', open: false, active: false },
      { path: 'C:\\man', name: 'man', open: false, active: false },
    ]);
  });
});

describe('rememberOpen', () => {
  it('ставит открытые в начало недавних и ограничивает список 20', () => {
    const recent = Array.from({ length: 25 }, (_, i) => `C:\\p${i}`);
    const res = rememberOpen({ recent, manual: [] }, ['C:\\new', 'C:\\p3']);
    expect(res.recent.slice(0, 3)).toEqual(['C:\\new', 'C:\\p3', 'C:\\p0']);
    expect(res.recent).toHaveLength(20);
  });
});

describe('listProjects', () => {
  it('показывает открытые и запоминает их как недавние', async () => {
    const { paths } = await setup();
    const res = await listProjects(paths, running);
    expect(res.projects).toEqual([{ path: 'C:\\work\\a', name: 'a', open: true, active: true }]);
    expect((await loadSettings(paths.userDir)).recent).toEqual(['C:\\work\\a']);
  });

  it('если VS Code не запущен, проекты становятся недавними', async () => {
    const { paths } = await setup();
    await listProjects(paths, running);
    const res = await listProjects(paths, stopped);
    expect(res.projects).toEqual([{ path: 'C:\\work\\a', name: 'a', open: false, active: false }]);
  });
});

describe('addManualProject / isKnownProject', () => {
  it('добавляет существующую папку и признаёт её известной', async () => {
    const { root, paths } = await setup();
    const proj = path.join(root, 'manual-proj');
    await writeFiles(proj, { 'readme.txt': 'x' });
    expect(await addManualProject(paths, proj)).toBe(proj);
    expect(await isKnownProject(paths, proj, running)).toBe(true);
    expect(await isKnownProject(paths, path.join(root, 'other'), running)).toBe(false);
  });

  it('отклоняет несуществующую папку', async () => {
    const { root, paths } = await setup();
    await expect(addManualProject(paths, path.join(root, 'nope'))).rejects.toThrow(/не найдена/);
  });
});
