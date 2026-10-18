import { afterEach, describe, expect, it } from 'vitest';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listTrash, purgeTrash, removeSkill, restoreFromTrash } from '../../src/core/trash';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const exists = (p: string) => access(p).then(() => true, () => false);

async function setup() {
  const root = await tmpDir();
  const home = path.join(root, 'home');
  const trash = path.join(root, 'user', 'trash');
  await writeFiles(root, {
    'home/.claude/skills/pdf/SKILL.md': '---\nname: PDF\n---\n',
    'home/.claude/skills/pdf/ref/a.md': 'a',
    'home/.claude/skills/synced/b/morning/SKILL.md': 'x',
    'proj/.agents/skills/local/SKILL.md': 'x',
  });
  return { root, home, trash };
}

describe('removeSkill / restoreFromTrash', () => {
  it('глобальный скилл уходит в корзину и возвращается целиком', async () => {
    const { home, trash } = await setup();
    const original = path.join(home, '.claude', 'skills', 'pdf');
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    expect(entry).toMatchObject({ name: 'pdf', agent: 'claude', scope: 'global', originalPath: original });
    expect(await exists(original)).toBe(false);
    expect(await exists(path.join(trash, entry.id, 'skill', 'ref', 'a.md'))).toBe(true);
    expect((await listTrash(trash)).map((e) => e.id)).toEqual([entry.id]);

    await restoreFromTrash(trash, entry.id);
    expect(await readFile(path.join(original, 'ref', 'a.md'), 'utf8')).toBe('a');
    expect(await exists(path.join(trash, entry.id))).toBe(false);
  });

  it('проектный скилл Codex', async () => {
    const { root, home, trash } = await setup();
    const entry = await removeSkill({ kind: 'project', path: path.join(root, 'proj') }, 'codex', 'local', home, trash);
    expect(entry.scope).toBe('project');
    expect(await exists(path.join(root, 'proj', '.agents', 'skills', 'local'))).toBe(false);
  });

  it('восстановление отклоняется, если на месте уже есть папка', async () => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    await writeFiles(home, { '.claude/skills/pdf/SKILL.md': 'new' });
    await expect(restoreFromTrash(trash, entry.id)).rejects.toThrow(/уже есть/);
  });

  it.each(['synced', '../x', 'a/b', '.trash'])('нельзя удалить «%s»', async (name) => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', name, home, trash)).rejects.toThrow(/нельзя/);
  });

  it('несуществующий скилл и неверный id корзины', async () => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', 'nope', home, trash)).rejects.toThrow(/не найден/);
    await expect(restoreFromTrash(trash, '../../evil')).rejects.toThrow(/id/);
  });
});

describe('purgeTrash', () => {
  it('удаляет записи старше срока', async () => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    expect(await purgeTrash(trash, 1000, entry.deletedAt + 500)).toBe(0);
    expect(await purgeTrash(trash, 1000, entry.deletedAt + 5000)).toBe(1);
    expect(await listTrash(trash)).toEqual([]);
  });
});
