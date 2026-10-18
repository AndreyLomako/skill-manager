import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileUriToPath, isVsCodeRunning, normalizeProjectPath, readOpenWindows } from '../../src/core/vscode-windows';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const storage = (windowsState: unknown) => JSON.stringify({ theme: 'vs-dark', windowsState });

describe('fileUriToPath', () => {
  it('декодирует диск, кириллицу и пробелы', () => {
    expect(
      fileUriToPath('file:///c%3A/Users/%D0%98%D0%B2%D0%B0%D0%BD/OneDrive/Desktop/my%20app', 'win32'),
    ).toBe('C:\\Users\\Иван\\OneDrive\\Desktop\\my app');
  });

  it('убирает хвостовой слэш, чтобы совпадать с путями Claude', () => {
    expect(fileUriToPath('file:///c%3A/work/a/', 'win32')).toBe('C:\\work\\a');
  });

  it('возвращает null для не-file URI', () => {
    expect(fileUriToPath('vscode-remote://wsl+Ubuntu/home/x', 'win32')).toBeNull();
  });
});

describe('normalizeProjectPath', () => {
  it('убирает префикс extended-length', () => {
    expect(normalizeProjectPath('\\\\?\\C:\\work\\a', 'win32')).toBe('C:\\work\\a');
  });

  it('extended-length UNC превращается в обычный UNC', () => {
    expect(normalizeProjectPath('\\\\?\\UNC\\server\\share\\x', 'win32')).toBe('\\\\server\\share\\x');
  });

  it('заменяет слэши, поднимает букву диска и убирает хвостовой разделитель', () => {
    expect(normalizeProjectPath('c:/work/a/', 'win32')).toBe('C:\\work\\a');
  });

  it('корень диска остаётся корнем', () => {
    expect(normalizeProjectPath('C:\\', 'win32')).toBe('C:\\');
  });
});

describe('readOpenWindows', () => {
  it('берёт папки окон, пропускает пустые и убирает дубликаты', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, {
      'storage.json': storage({
        lastActiveWindow: { folder: 'file:///c%3A/work/b' },
        openedWindows: [
          { folder: 'file:///c%3A/work/a' },
          { backupPath: 'C:\\backup' },
          { folder: 'file:///c%3A/work/b' },
        ],
      }),
    });
    expect(await readOpenWindows(path.join(dir, 'storage.json'), 'win32')).toEqual({
      open: ['C:\\work\\a', 'C:\\work\\b'],
      active: 'C:\\work\\b',
    });
  });

  it('раскрывает папки из .code-workspace', async () => {
    const dir = await tmpDir();
    const ws = path.join(dir, 'proj', 'my.code-workspace');
    await writeFiles(dir, {
      'proj/my.code-workspace':
        '{\n  // комментарий\n  "folders": [{ "path": "front" }, { "path": "../back" },]\n}',
      'storage.json': storage({
        openedWindows: [{ workspace: { id: '1', configPath: pathToFileURL(ws).href } }],
      }),
    });
    const res = await readOpenWindows(path.join(dir, 'storage.json'));
    expect(res.open.map((p) => p.toLowerCase())).toEqual(
      [path.join(dir, 'proj', 'front'), path.join(dir, 'back')].map((p) => p.toLowerCase()),
    );
    expect(res.active).toBeNull();
  });

  it('сообщает об ошибке, если файла нет', async () => {
    const dir = await tmpDir();
    const res = await readOpenWindows(path.join(dir, 'nope.json'));
    expect(res.open).toEqual([]);
    expect(res.error).toMatch(/VS Code/);
  });

  it('сообщает об ошибке при битом JSON', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, { 'storage.json': '{oops' });
    expect((await readOpenWindows(path.join(dir, 'storage.json'))).error).toBeDefined();
  });
});

describe.each(['darwin', 'linux'] as const)('posix (%s)', (platform) => {
  it('fileUriToPath: декодирует пробелы и кириллицу, убирает хвостовой слэш', () => {
    expect(fileUriToPath('file:///home/u/my%20app', platform)).toBe('/home/u/my app');
    expect(fileUriToPath('file:///home/u/%D0%BF%D1%80/', platform)).toBe('/home/u/пр');
    expect(fileUriToPath('file:///', platform)).toBe('/');
    expect(fileUriToPath('vscode-remote://wsl+Ubuntu/home/x', platform)).toBeNull();
  });

  it('normalizeProjectPath: posix.normalize, без хвостового / (кроме корня), обратные слэши не трогает', () => {
    expect(normalizeProjectPath('/home/u//a/../b/', platform)).toBe('/home/u/b');
    expect(normalizeProjectPath('/', platform)).toBe('/');
    expect(normalizeProjectPath('/home/u/a\b', platform)).toBe('/home/u/a\b');
    expect(normalizeProjectPath('/Users/U/App', platform)).toBe('/Users/U/App');
  });

  it('readOpenWindows: posix-папки окон', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, {
      'storage.json': storage({
        lastActiveWindow: { folder: 'file:///home/u/b' },
        openedWindows: [{ folder: 'file:///home/u/a' }, { folder: 'file:///home/u/b/' }],
      }),
    });
    expect(await readOpenWindows(path.join(dir, 'storage.json'), platform)).toEqual({
      open: ['/home/u/a', '/home/u/b'],
      active: '/home/u/b',
    });
  });
});

describe('readOpenWindows: регистр путей', () => {
  const state = storage({
    openedWindows: [{ folder: 'file:///home/u/App' }, { folder: 'file:///home/u/app' }],
  });

  it('linux различает регистр', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, { 'storage.json': state });
    expect((await readOpenWindows(path.join(dir, 'storage.json'), 'linux')).open).toEqual(['/home/u/App', '/home/u/app']);
  });

  it('darwin не различает регистр', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, { 'storage.json': state });
    expect((await readOpenWindows(path.join(dir, 'storage.json'), 'darwin')).open).toEqual(['/home/u/App']);
  });
});

describe('isVsCodeRunning', () => {
  it('win32: tasklist Code.exe', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = async (c: string, a: string[]) => (calls.push([c, a]), { code: 0, stdout: 'Code.exe 1 Console' });
    expect(await isVsCodeRunning('win32', run)).toBe(true);
    expect(calls).toEqual([['tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH']]]);
  });

  it('darwin: pgrep -x Code; linux: pgrep -x code', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = async (c: string, a: string[]) => (calls.push([c, a]), { code: 0, stdout: '1\n' });
    expect(await isVsCodeRunning('darwin', run)).toBe(true);
    expect(await isVsCodeRunning('linux', run)).toBe(true);
    expect(calls).toEqual([
      ['pgrep', ['-x', 'Code']],
      ['pgrep', ['-x', 'code']],
    ]);
    expect(await isVsCodeRunning('linux', async () => ({ code: 1, stdout: '' }))).toBe(false);
  });
});
