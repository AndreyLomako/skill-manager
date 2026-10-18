import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import {
  addManualProject,
  isKnownProject,
  listProjects,
  loadSettings,
  memoizeFor,
  mergeSignals,
  rememberOpen,
} from '../../src/core/projects';
import type { AppPaths } from '../../src/core/paths';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const deps = {
  platform: 'win32' as const,
  vscodeRunning: async () => true,
  pidAlive: (pid: number) => pid === 4242,
  codexRunning: async () => false,
};
const stoppedDeps = { ...deps, vscodeRunning: async () => false, pidAlive: () => false };

async function setup() {
  const root = await tmpDir();
  const paths: AppPaths = {
    baseCatalogDir: path.join(root, 'catalog'),
    userDir: path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage: path.join(root, 'storage.json'),
    home: path.join(root, 'home'),
    trashDir: path.join(root, 'user', 'trash'),
  };
  await writeFiles(root, {
    'storage.json': JSON.stringify({
      windowsState: {
        lastActiveWindow: { folder: 'file:///c%3A/work/a' },
        openedWindows: [{ folder: 'file:///c%3A/work/a' }],
      },
    }),
    'home/.claude/sessions/4242.json': JSON.stringify({ pid: 4242, cwd: 'c:\\work\\claude-proj', startedAt: 5 }),
    'home/.claude.json': JSON.stringify({ projects: { 'c:/work/claude-recent': {} } }),
  });
  return { root, paths };
}

describe('mergeSignals', () => {
  it('активный, открытые (vscode первыми), недавние по свежести, settings; источники объединяются', () => {
    const res = mergeSignals(
      [
        { path: 'C:\\b', source: 'vscode', open: true, at: 0 },
        { path: 'C:\\a', source: 'vscode', open: true, at: 0 },
        { path: 'c:\\B', source: 'claude', open: true, at: 50 },
        { path: 'C:\\c', source: 'claude', open: true, at: 90 },
        { path: 'C:\\old', source: 'codex', open: false, at: 10 },
        { path: 'C:\\newer', source: 'codex', open: false, at: 20 },
      ],
      'C:\\a',
      { recent: ['C:\\rec', 'C:\\old'], manual: ['C:\\man', 'C:\\a'] },
      'win32',
    );
    expect(res.map((p) => p.path)).toEqual(['C:\\a', 'C:\\b', 'C:\\c', 'C:\\newer', 'C:\\old', 'C:\\rec', 'C:\\man']);
    expect(res[0]).toEqual({ path: 'C:\\a', name: 'a', open: true, active: true, sources: ['vscode', 'manual'] });
    expect(res[1]).toEqual({ path: 'C:\\b', name: 'b', open: true, active: false, sources: ['vscode', 'claude'] });
    expect(res.find((p) => p.path === 'C:\\rec')).toEqual({ path: 'C:\\rec', name: 'rec', open: false, active: false, sources: [] });
  });

  it('путь стабилен при смене порядка/регистра сигналов: берётся написание из settings', () => {
    const s = { recent: ['C:\\Work\\A'], manual: [] };
    const fromVscode = { path: 'C:\\Work\\A', source: 'vscode' as const, open: true, at: 0 };
    const fromClaude = { path: 'c:\\work\\a', source: 'claude' as const, open: true, at: 5 };
    const first = mergeSignals([fromVscode, fromClaude], 'C:\\Work\\A', s, 'win32');
    const second = mergeSignals([fromClaude, fromVscode], 'c:\\work\\a', s, 'win32');
    expect(first.map((p) => p.path)).toEqual(['C:\\Work\\A']);
    expect(second.map((p) => p.path)).toEqual(['C:\\Work\\A']);
    expect(second[0]).toMatchObject({ name: 'A', active: true, sources: ['vscode', 'claude'] });
  });

  it('без записи в settings берётся написание первого сигнала', () => {
    const res = mergeSignals([{ path: 'c:\\work\\a', source: 'claude', open: true, at: 5 }], 'C:\\WORK\\A', {
      recent: [],
      manual: [],
    }, 'win32');
    expect(res.map((p) => p.path)).toEqual(['c:\\work\\a']);
  });
});

describe('memoizeFor', () => {
  it('вызывает fn один раз в окне, делит промис между конкурентными вызовами и обновляет после окна', async () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn(async () => true);
      const memo = memoizeFor(5000, fn);
      await Promise.all([memo(), memo()]);
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(4000);
      await memo();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1500);
      await memo();
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rememberOpen', () => {
  it('ставит открытые в начало недавних и ограничивает список 20', () => {
    const recent = Array.from({ length: 25 }, (_, i) => `C:\\p${i}`);
    const res = rememberOpen({ recent, manual: [] }, ['C:\\new', 'C:\\p3'], 'win32');
    expect(res.recent.slice(0, 3)).toEqual(['C:\\new', 'C:\\p3', 'C:\\p0']);
    expect(res.recent).toHaveLength(20);
  });

  it('сохраняет уже записанное написание пути', () => {
    const res = rememberOpen({ recent: ['C:\\Work\\A', 'C:\\b'], manual: [] }, ['c:\\work\\a'], 'win32');
    expect(res.recent).toEqual(['C:\\Work\\A', 'C:\\b']);
  });
});

describe('loadSettings', () => {
  it('отсутствующий файл даёт пустые настройки', async () => {
    const { paths } = await setup();
    expect(await loadSettings(paths.userDir)).toEqual({ recent: [], manual: [] });
  });

  it('битый settings.json сохраняется в резервную копию', async () => {
    const { root, paths } = await setup();
    await writeFiles(root, { 'user/settings.json': '{oops' });
    expect(await loadSettings(paths.userDir)).toEqual({ recent: [], manual: [] });
    const files = await readdir(paths.userDir);
    const backup = files.find((f) => f.startsWith('settings.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(files).not.toContain('settings.json');
    expect(await readFile(path.join(paths.userDir, backup!), 'utf8')).toBe('{oops');
  });

  it('пустой settings.json не считается битым и остаётся на месте', async () => {
    const { root, paths } = await setup();
    await writeFiles(root, { 'user/settings.json': '  \n' });
    expect(await loadSettings(paths.userDir)).toEqual({ recent: [], manual: [] });
    const files = await readdir(paths.userDir);
    expect(files).toEqual(['settings.json']);
  });
});

describe('listProjects', () => {
  it('объединяет VS Code, Claude и запоминает открытые как недавние', async () => {
    const { paths } = await setup();
    const res = await listProjects(paths, deps);
    expect(res.projects).toEqual([
      { path: 'C:\\work\\a', name: 'a', open: true, active: true, sources: ['vscode'] },
      { path: 'C:\\work\\claude-proj', name: 'claude-proj', open: true, active: false, sources: ['claude'] },
      { path: 'C:\\work\\claude-recent', name: 'claude-recent', open: false, active: false, sources: ['claude'] },
    ]);
    expect((await loadSettings(paths.userDir)).recent).toEqual(['C:\\work\\a', 'C:\\work\\claude-proj']);
  });

  it('если VS Code не запущен, проекты становятся недавними', async () => {
    const { paths } = await setup();
    await listProjects(paths, deps);
    const res = await listProjects(paths, stoppedDeps);
    expect(res.projects).toContainEqual({ path: 'C:\\work\\a', name: 'a', open: false, active: false, sources: [] });
    expect(res.projects).toContainEqual({ path: 'C:\\work\\claude-proj', name: 'claude-proj', open: false, active: false, sources: [] });
    expect(res.projects).toContainEqual({ path: 'C:\\work\\claude-recent', name: 'claude-recent', open: false, active: false, sources: ['claude'] });
  });

  it('если VS Code не запущен, активной становится свежая сессия Claude', async () => {
    const { paths } = await setup();
    const res = await listProjects(paths, { ...deps, vscodeRunning: async () => false });
    expect(res.projects.find((p) => p.path === 'C:\\work\\claude-proj')?.active).toBe(true);
  });
});

describe('addManualProject / isKnownProject', () => {
  it('добавляет существующую папку и признаёт её известной', async () => {
    const { root, paths } = await setup();
    const proj = path.join(root, 'manual-proj');
    await writeFiles(proj, { 'readme.txt': 'x' });
    expect(await addManualProject(paths, proj)).toBe(proj);
    expect(await isKnownProject(paths, proj, deps)).toBe(true);
    expect(await isKnownProject(paths, path.join(root, 'other'), deps)).toBe(false);
  });

  it('отклоняет несуществующую папку', async () => {
    const { root, paths } = await setup();
    await expect(addManualProject(paths, path.join(root, 'nope'))).rejects.toThrow(/не найдена/);
  });
});

describe('mergeSignals: платформы', () => {
  const signals = [
    { path: '/home/u/App', source: 'vscode' as const, open: true, at: 0 },
    { path: '/home/u/app', source: 'claude' as const, open: true, at: 5 },
  ];

  it('linux: регистр различается, это два проекта', () => {
    const res = mergeSignals(signals, '/home/u/App', { recent: [], manual: [] }, 'linux');
    expect(res.map((p) => [p.path, p.name, p.sources])).toEqual([
      ['/home/u/App', 'App', ['vscode']],
      ['/home/u/app', 'app', ['claude']],
    ]);
    expect(res[0].active).toBe(true);
    expect(res[1].active).toBe(false);
  });

  it('darwin: регистр не различается, источники объединяются', () => {
    const res = mergeSignals(signals, '/home/u/App', { recent: [], manual: [] }, 'darwin');
    expect(res).toEqual([{ path: '/home/u/App', name: 'App', open: true, active: true, sources: ['vscode', 'claude'] }]);
  });

  it.each(['darwin', 'linux'] as const)('%s: имя берётся из posix-пути, «/» остаётся корнем', (platform) => {
    const res = mergeSignals(
      [{ path: '/', source: 'manual', open: false, at: 0 }, { path: '/home/u/my app', source: 'claude', open: true, at: 1 }],
      null,
      { recent: [], manual: [] },
      platform,
    );
    expect(res.map((p) => p.name)).toEqual(['my app', '/']);
  });

  it('linux: settings хранит написание, mergeSignals и rememberOpen не склеивают разный регистр', () => {
    const s = rememberOpen({ recent: ['/home/u/App'], manual: [] }, ['/home/u/app'], 'linux');
    expect(s.recent).toEqual(['/home/u/app', '/home/u/App']);
    const s2 = rememberOpen({ recent: ['/home/u/App'], manual: [] }, ['/home/u/app'], 'darwin');
    expect(s2.recent).toEqual(['/home/u/App']);
  });
});

describe('listProjects: linux', () => {
  it('читает posix-пути из VS Code, Claude и Codex-подобных сигналов', async () => {
    const root = await tmpDir();
    const paths: AppPaths = {
      baseCatalogDir: path.join(root, 'catalog'),
      userDir: path.join(root, 'user'),
      cacheDir: path.join(root, '.cache'),
      vscodeStorage: path.join(root, 'storage.json'),
      home: path.join(root, 'home'),
      trashDir: path.join(root, 'user', 'trash'),
    };
    await writeFiles(root, {
      'storage.json': JSON.stringify({
        windowsState: {
          lastActiveWindow: { folder: 'file:///home/u/my%20app' },
          openedWindows: [{ folder: 'file:///home/u/my%20app' }],
        },
      }),
      'home/.claude/sessions/7.json': JSON.stringify({ pid: 7, cwd: '/home/u/claude-proj/', startedAt: 5 }),
      'home/.claude.json': JSON.stringify({ projects: { '/home/u/recent': {}, 'rel/x': {} } }),
    });
    const res = await listProjects(paths, {
      platform: 'linux',
      vscodeRunning: async () => true,
      pidAlive: () => true,
      codexRunning: async () => false,
    });
    expect(res.projects).toEqual([
      { path: '/home/u/my app', name: 'my app', open: true, active: true, sources: ['vscode'] },
      { path: '/home/u/claude-proj', name: 'claude-proj', open: true, active: false, sources: ['claude'] },
      { path: '/home/u/recent', name: 'recent', open: false, active: false, sources: ['claude'] },
    ]);
  });
});

describe('addManualProject: платформа', () => {
  it('linux: повторное добавление той же папки не дублируется', async () => {
    const { root, paths } = await setup();
    const proj = path.join(root, 'manual-proj');
    await writeFiles(proj, { 'readme.txt': 'x' });
    await addManualProject(paths, proj, 'linux');
    await addManualProject(paths, proj, 'linux');
    expect((await loadSettings(paths.userDir)).manual).toEqual([proj]);
  });
});
