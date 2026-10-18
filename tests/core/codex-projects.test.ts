import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { findCodexStateDb, isCodexRunning, readCodexProjects } from '../../src/core/codex-projects';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

async function makeDb(home: string, file: string, columns: string, rows: Array<Array<string | number | null>>) {
  await mkdir(path.join(home, '.codex'), { recursive: true });
  const db = new DatabaseSync(path.join(home, '.codex', file));
  db.exec(`create table threads (${columns})`);
  const marks = columns.split(',').map(() => '?').join(',');
  const insert = db.prepare(`insert into threads values (${marks})`);
  for (const r of rows) insert.run(...r);
  db.close();
}

describe('findCodexStateDb', () => {
  it('берёт файл с наибольшим номером', async () => {
    const home = await tmpDir();
    await writeFiles(home, { '.codex/state_4.sqlite': '', '.codex/state_12.sqlite': '', '.codex/logs_2.sqlite': '' });
    expect(await findCodexStateDb(home)).toBe(path.join(home, '.codex', 'state_12.sqlite'));
  });

  it('нет ~/.codex — null', async () => {
    expect(await findCodexStateDb(await tmpDir())).toBeNull();
  });
});

describe('readCodexProjects', () => {
  it('уникальные cwd без архивных, свежие выше; при запущенном Codex первый открыт', async () => {
    const home = await tmpDir();
    await makeDb(home, 'state_5.sqlite', 'cwd text, recency_at_ms integer, archived integer', [
      ['c:\\work\\a', 100, 0],
      ['c:\\work\\b', 300, 0],
      ['c:\\work\\a', 500, 0],
      ['c:\\work\\gone', 900, 1],
      ['', 950, 0],
    ]);
    expect(await readCodexProjects(home, async () => true, 20, 'win32')).toEqual([
      { path: 'C:\\work\\a', source: 'codex', open: true, at: 500 },
      { path: 'C:\\work\\b', source: 'codex', open: false, at: 300 },
    ]);
    expect((await readCodexProjects(home, async () => false, 20, 'win32'))[0].open).toBe(false);
  });

  it('старая схема с updated_at (секунды) переводится в мс', async () => {
    const home = await tmpDir();
    await makeDb(home, 'state_1.sqlite', 'cwd text, updated_at integer', [['c:\\x', 7]]);
    expect(await readCodexProjects(home, async () => false, 20, 'win32')).toEqual([
      { path: 'C:\\x', source: 'codex', open: false, at: 7000 },
    ]);
  });

  it('WAL-база без -wal/-shm читается, не создавая файлов в ~/.codex', async () => {
    const home = await tmpDir();
    await mkdir(path.join(home, '.codex'), { recursive: true });
    const file = path.join(home, '.codex', 'state_3.sqlite');
    const db = new DatabaseSync(file);
    db.exec('pragma journal_mode=wal');
    db.exec('create table threads (cwd text, recency_at_ms integer)');
    db.prepare('insert into threads values (?, ?)').run('c:\\work\\w', 42);
    db.close();
    await rm(`${file}-wal`, { force: true });
    await rm(`${file}-shm`, { force: true });
    expect(await readCodexProjects(home, async () => false, 20, 'win32')).toEqual([
      { path: 'C:\\work\\w', source: 'codex', open: false, at: 42 },
    ]);
    expect((await readdir(path.join(home, '.codex'))).sort()).toEqual(['state_3.sqlite']);
  });

  it('нет таблицы/колонки cwd или нет базы — пусто', async () => {
    const home = await tmpDir();
    expect(await readCodexProjects(home, async () => true)).toEqual([]);
    await makeDb(home, 'state_2.sqlite', 'title text', [['t']]);
    expect(await readCodexProjects(home, async () => true)).toEqual([]);
  });
});

describe.each(['darwin', 'linux'] as const)('posix (%s)', (platform) => {
  it('строки с posix cwd нормализуются, свежие выше, первый открыт при запущенном Codex', async () => {
    const home = await tmpDir();
    await makeDb(home, 'state_5.sqlite', 'cwd text, recency_at_ms integer, archived integer', [
      ['/home/u/a/', 100, 0],
      ['/home/u//b', 300, 0],
      ['/home/u/a', 500, 0],
      ['/home/u/gone', 900, 1],
    ]);
    expect(await readCodexProjects(home, async () => true, 20, platform)).toEqual([
      { path: '/home/u/a', source: 'codex', open: true, at: 500 },
      { path: '/home/u/b', source: 'codex', open: false, at: 300 },
      { path: '/home/u/a', source: 'codex', open: false, at: 100 },
    ]);
  });
});

describe('isCodexRunning', () => {
  it('win32: tasklist codex.exe; darwin/linux: pgrep -x codex', async () => {
    const calls: Array<[string, string[]]> = [];
    const run = async (c: string, a: string[]) => (calls.push([c, a]), { code: 0, stdout: 'codex.exe 1 Console' });
    expect(await isCodexRunning('win32', run)).toBe(true);
    expect(await isCodexRunning('darwin', run)).toBe(true);
    expect(await isCodexRunning('linux', run)).toBe(true);
    expect(calls).toEqual([
      ['tasklist', ['/FI', 'IMAGENAME eq codex.exe', '/NH']],
      ['pgrep', ['-x', 'codex']],
      ['pgrep', ['-x', 'codex']],
    ]);
    expect(await isCodexRunning('linux', async () => ({ code: 1, stdout: '' }))).toBe(false);
  });
});
