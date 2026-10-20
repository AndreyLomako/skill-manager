import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, chmod, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  getInstalledAction,
  installSkillsAction,
  listInstalledAction,
  uninstallPluginAction,
} from '../../src/app/actions';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

const ENV = [
  'SKILL_MANAGER_HOME',
  'SKILL_MANAGER_USER_DIR',
  'SKILL_MANAGER_CATALOG_DIR',
  'SKILL_MANAGER_CACHE_DIR',
  'SKILL_MANAGER_VSCODE_STORAGE',
] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
});
afterEach(async () => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await cleanupTmp();
});

const exists = (p: string) => access(p).then(() => true, () => false);

describe('server actions: без клонирования', () => {
  it('установленное, список и установка не клонируют незагруженный git-источник', async () => {
    const root = await tmpDir();
    const cacheDir = path.join(root, 'cache');
    // Недоступный репозиторий: клон был бы долгим (повтор через 1,5 с) и всё равно неудачным.
    const url = pathToFileURL(path.join(root, 'no-such-repo')).href;
    await writeFiles(root, {
      'catalog/catalog.json': JSON.stringify({
        version: 1,
        categories: [{ id: 'design', title: 'Дизайн' }],
        sources: [{ id: 'remote', type: 'git', url }],
        skills: [{ id: 'remote-skill', source: 'remote', path: 'skills/x', category: 'design' }],
      }),
    });
    process.env.SKILL_MANAGER_HOME = path.join(root, 'home');
    process.env.SKILL_MANAGER_USER_DIR = path.join(root, 'user');
    process.env.SKILL_MANAGER_CATALOG_DIR = path.join(root, 'catalog');
    process.env.SKILL_MANAGER_CACHE_DIR = cacheDir;
    process.env.SKILL_MANAGER_VSCODE_STORAGE = path.join(root, 'none.json');

    await getInstalledAction({ kind: 'global' }, ['claude', 'codex']);
    await listInstalledAction({ kind: 'global' }, ['claude', 'codex']);
    const results = await installSkillsAction({ kind: 'global' }, ['claude'], ['remote-skill']);

    expect(await exists(cacheDir)).toBe(false);
    expect(results).toEqual([expect.objectContaining({ skillId: 'remote-skill', status: 'error' })]);
  });
});

describe('uninstallPluginAction', () => {
  // Поддельный Claude Code: записывает аргументы и убирает плагин, как настоящий `claude plugin uninstall`.
  const FAKE = `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const home = process.env.SKILL_MANAGER_HOME;
appendFileSync(path.join(home, 'calls.txt'), JSON.stringify(process.argv.slice(2)) + '\\n');
const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
delete data.plugins[process.argv[4]];
writeFileSync(file, JSON.stringify(data));
`;

  async function setup() {
    const root = await tmpDir();
    const home = path.join(root, 'home');
    const bin = path.join(root, 'bin');
    await writeFiles(root, {
      'catalog/catalog.json': JSON.stringify({ version: 1, categories: [], sources: [], skills: [] }),
      'home/.claude/plugins/installed_plugins.json': JSON.stringify({
        version: 2,
        plugins: { 'sp@market': [{ scope: 'user', installPath: path.join(root, 'p') }] },
      }),
      'home/.claude/settings.json': JSON.stringify({ enabledPlugins: { 'sp@market': true } }),
      'bin/fake.mjs': FAKE,
      ...(process.platform === 'win32'
        ? { 'bin/claude.cmd': '@node "%~dp0fake.mjs" %*\r\n' }
        : { 'bin/claude': '#!/bin/sh\nexec node "$(dirname "$0")/fake.mjs" "$@"\n' }),
    });
    if (process.platform !== 'win32') await chmod(path.join(bin, 'claude'), 0o755);
    process.env.SKILL_MANAGER_HOME = home;
    process.env.SKILL_MANAGER_USER_DIR = path.join(root, 'user');
    process.env.SKILL_MANAGER_CATALOG_DIR = path.join(root, 'catalog');
    process.env.SKILL_MANAGER_CACHE_DIR = path.join(root, 'cache');
    return { home, bin };
  }

  const savedPath = process.env.PATH;
  afterEach(() => {
    process.env.PATH = savedPath;
  });

  it('удаляет установленный плагин через найденный Claude Code', async () => {
    const { home, bin } = await setup();
    process.env.PATH = [bin, path.dirname(process.execPath)].join(path.delimiter);
    expect(await uninstallPluginAction('sp@market')).toEqual({ ok: true, via: 'cli' });
    expect(await readFile(path.join(home, 'calls.txt'), 'utf8')).toBe(
      JSON.stringify(['plugin', 'uninstall', 'sp@market', '--scope', 'user', '--keep-data']) + '\n',
    );
  });

  it('плагин не из списка установленных не трогается', async () => {
    const { home, bin } = await setup();
    process.env.PATH = [bin, path.dirname(process.execPath)].join(path.delimiter);
    const res = await uninstallPluginAction('other@market');
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/не установлен/) });
    expect(await exists(path.join(home, 'calls.txt'))).toBe(false);
  });

  it('без Claude Code — ошибка и команда для ручного удаления', async () => {
    await setup();
    process.env.PATH = '';
    expect(await uninstallPluginAction('sp@market')).toEqual({
      ok: false,
      error: expect.stringMatching(/Claude Code не найден/),
      command: '/plugin uninstall sp@market',
    });
  });
});
