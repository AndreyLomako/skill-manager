import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getInstalledAction, installSkillsAction, listInstalledAction } from '../../src/app/actions';
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
