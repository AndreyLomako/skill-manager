import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileUriToPath, readOpenWindows } from '../../src/core/vscode-windows';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const storage = (windowsState: unknown) => JSON.stringify({ theme: 'vs-dark', windowsState });

describe('fileUriToPath', () => {
  it('декодирует диск, кириллицу и пробелы', () => {
    expect(
      fileUriToPath('file:///c%3A/Users/%D0%98%D0%B2%D0%B0%D0%BD/OneDrive/Desktop/my%20app'),
    ).toBe('C:\\Users\\Иван\\OneDrive\\Desktop\\my app');
  });

  it('возвращает null для не-file URI', () => {
    expect(fileUriToPath('vscode-remote://wsl+Ubuntu/home/x')).toBeNull();
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
    expect(await readOpenWindows(path.join(dir, 'storage.json'))).toEqual({
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
