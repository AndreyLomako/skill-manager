import { afterEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseManifest } from '../../src/core/manifest';
import { addUserSkill, slugify, type NewUserSkill } from '../../src/core/user-catalog';
import type { SourceDef } from '../../src/core/types';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const read = async (userDir: string) =>
  parseManifest(await readFile(path.join(userDir, 'user-catalog.json'), 'utf8'), 'T');

describe('slugify', () => {
  it('латиница и цифры', () => expect(slugify('Owner/My_Repo.git')).toBe('owner-my-repo'));
  it('кириллица даёт пустую строку', () => expect(slugify('Мои штуки')).toBe(''));
});

describe('addUserSkill', () => {
  it('создаёт файл с git-источником, скиллом и новой категорией', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const res = await addUserSkill(userDir, {
      kind: 'git', location: 'https://github.com/owner/repo', ref: 'main',
      skillPath: 'skills/cool-skill/', category: '', newCategoryTitle: 'Мои штуки',
    });
    expect(res).toEqual({ skillId: 'cool-skill' });
    const m = await read(userDir);
    expect(m.categories).toEqual([{ id: 'custom', title: 'Мои штуки' }]);
    expect(m.sources).toEqual([{ id: 'owner-repo', type: 'git', url: 'https://github.com/owner/repo', ref: 'main' }]);
    expect(m.skills).toEqual([{ id: 'cool-skill', source: 'owner-repo', path: 'skills/cool-skill', category: 'custom' }]);
  });

  it('переиспользует источник и делает id уникальными', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const input = { kind: 'git' as const, location: 'https://github.com/owner/repo', skillPath: 'skills/x', category: 'graphics' };
    await addUserSkill(userDir, input);
    expect(await addUserSkill(userDir, input)).toEqual({ skillId: 'x-2' });
    const m = await read(userDir);
    expect(m.sources).toHaveLength(1);
    expect(m.skills.map((s) => s.id)).toEqual(['x', 'x-2']);
  });

  it('локальная папка сохраняется абсолютным путём, id — из имени папки', async () => {
    const root = await tmpDir();
    const userDir = path.join(root, 'user');
    await writeFiles(root, { 'my-skill/SKILL.md': '---\nname: M\n---\n' });
    expect(
      await addUserSkill(userDir, { kind: 'local', location: path.join(root, 'my-skill'), category: 'graphics' }),
    ).toEqual({ skillId: 'my-skill' });
    expect((await read(userDir)).sources[0]).toEqual({
      id: 'my-skill', type: 'local', path: path.join(root, 'my-skill'),
    });
  });

  it.each([
    [{ kind: 'git' as const, location: '  ', category: 'graphics' }, /адрес/],
    [{ kind: 'git' as const, location: 'https://github.com/o/r', category: '' }, /категори/],
  ])('валидирует ввод %#', async (input, re) => {
    await expect(addUserSkill(path.join(await tmpDir(), 'user'), input)).rejects.toThrow(re);
  });

  it('не перезаписывает битый файл', async () => {
    const root = await tmpDir();
    await writeFiles(root, { 'user/user-catalog.json': '{oops' });
    await expect(
      addUserSkill(path.join(root, 'user'), { kind: 'git', location: 'https://github.com/o/r', category: 'g' }),
    ).rejects.toThrow();
    expect(await readFile(path.join(root, 'user', 'user-catalog.json'), 'utf8')).toBe('{oops');
  });

  it('проверка перед записью получает источник и путь; ошибка проверки — ничего не пишется', async () => {
    const root = await tmpDir();
    const userDir = path.join(root, 'user');
    const seen: [SourceDef, string][] = [];
    const verify = async (src: SourceDef, skillPath: string) => {
      seen.push([src, skillPath]);
      throw new Error('SKILL.md не найден по пути «skills/x»');
    };
    const input = { kind: 'git' as const, location: 'https://github.com/owner/repo', skillPath: 'skills/x', category: 'g' };
    await expect(addUserSkill(userDir, input, verify)).rejects.toThrow(/SKILL.md не найден/);
    expect(seen).toEqual([[{ id: 'owner-repo', type: 'git', url: 'https://github.com/owner/repo' }, 'skills/x']]);
    expect(await readdir(root)).toEqual([]);

    await addUserSkill(userDir, input);
    const before = await readFile(path.join(userDir, 'user-catalog.json'), 'utf8');
    await expect(addUserSkill(userDir, { ...input, skillPath: 'skills/y' }, verify)).rejects.toThrow();
    expect(await readFile(path.join(userDir, 'user-catalog.json'), 'utf8')).toBe(before);
    expect(await readdir(userDir)).toEqual(['user-catalog.json']);
  });

  it('успешная проверка — скилл сохраняется', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const verify = async () => {};
    expect(
      await addUserSkill(userDir, { kind: 'git', location: 'https://github.com/o/r', skillPath: 'a', category: 'g' }, verify),
    ).toEqual({ skillId: 'a' });
    expect((await read(userDir)).skills).toHaveLength(1);
  });

  it('неизвестный тип источника отклоняется', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const input = { kind: 'svn', location: 'x', category: 'g' } as unknown as NewUserSkill;
    await expect(addUserSkill(userDir, input)).rejects.toThrow('Неизвестный тип источника');
  });
});
