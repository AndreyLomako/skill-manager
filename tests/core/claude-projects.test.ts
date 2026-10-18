import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pidAlive, readClaudeRecent, readClaudeSessions } from '../../src/core/claude-projects';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

describe('readClaudeSessions', () => {
  it('берёт только живые сессии, свежие выше, пропускает мусор', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude/sessions/100.json': JSON.stringify({ pid: 100, cwd: 'c:\\work\\old', startedAt: 1000, entrypoint: 'cli' }),
      '.claude/sessions/200.json': JSON.stringify({ pid: 200, cwd: 'c:\\work\\new', startedAt: 2000, entrypoint: 'claude-vscode' }),
      '.claude/sessions/300.json': JSON.stringify({ pid: 300, cwd: 'c:\\work\\dead', startedAt: 3000 }),
      '.claude/sessions/400.json': '{oops',
      '.claude/sessions/200.abc.key': 'x',
    });
    const alive = (pid: number) => pid !== 300;
    expect(await readClaudeSessions(home, alive, 'win32')).toEqual([
      { path: 'C:\\work\\new', source: 'claude', open: true, at: 2000 },
      { path: 'C:\\work\\old', source: 'claude', open: true, at: 1000 },
    ]);
  });

  it('нет папки — пусто', async () => {
    expect(await readClaudeSessions(await tmpDir(), () => true)).toEqual([]);
  });
});

describe('readClaudeRecent', () => {
  it('ключи projects из ~/.claude.json с нормализацией путей', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude.json': JSON.stringify({ projects: { 'c:/Users/me/a': {}, 'C:\\Users\\me\\b': {} } }),
    });
    expect(await readClaudeRecent(home, 'win32')).toEqual([
      { path: 'C:\\Users\\me\\a', source: 'claude', open: false, at: 0 },
      { path: 'C:\\Users\\me\\b', source: 'claude', open: false, at: 0 },
    ]);
  });

  it('относительные ключи отбрасываются', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude.json': JSON.stringify({ projects: { 'relative/dir': {}, x: {}, 'C:\\ok': {} } }),
    });
    expect((await readClaudeRecent(home, 'win32')).map((p) => p.path)).toEqual(['C:\\ok']);
  });

  it('нет файла или битый — пусто', async () => {
    const home = await tmpDir();
    expect(await readClaudeRecent(home)).toEqual([]);
    await writeFiles(home, { '.claude.json': '{oops' });
    expect(await readClaudeRecent(home)).toEqual([]);
  });
});

describe('pidAlive', () => {
  it('свой процесс жив, несуществующий — нет', () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(0)).toBe(false);
    expect(pidAlive(-5)).toBe(false);
  });
});

describe.each(['darwin', 'linux'] as const)('posix (%s)', (platform) => {
  it('readClaudeSessions: нормализует posix cwd', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude/sessions/1.json': JSON.stringify({ pid: 1, cwd: '/home/u/a/', startedAt: 10 }),
      '.claude/sessions/2.json': JSON.stringify({ pid: 2, cwd: '/home/u//b', startedAt: 20 }),
    });
    expect(await readClaudeSessions(home, () => true, platform)).toEqual([
      { path: '/home/u/b', source: 'claude', open: true, at: 20 },
      { path: '/home/u/a', source: 'claude', open: true, at: 10 },
    ]);
  });

  it('readClaudeRecent: абсолютные posix-ключи, относительные отбрасываются', async () => {
    const home = await tmpDir();
    await writeFiles(home, {
      '.claude.json': JSON.stringify({
        projects: { '/home/u/a/': {}, '/Users/u/B': {}, 'relative/dir': {}, x: {}, 'C:\win': {}, '  ': {} },
      }),
    });
    expect((await readClaudeRecent(home, platform)).map((p) => p.path)).toEqual(['/home/u/a', '/Users/u/B']);
  });
});
