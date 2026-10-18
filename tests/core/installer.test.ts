import { afterEach, describe, expect, it } from 'vitest';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getInstalled, installSkills, skillTargetDir } from '../../src/core/installer';
import type { CatalogSkill } from '../../src/core/types';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const exists = (p: string) => access(p).then(() => true, () => false);

async function setup() {
  const root = await tmpDir();
  await writeFiles(root, {
    'lib/a/SKILL.md': '---\nname: A\n---\n',
    'lib/a/ref/notes.md': 'n',
    'lib/b/SKILL.md': '---\nname: B\n---\n',
    'project/readme.txt': 'x',
  });
  const skill = (id: string): CatalogSkill => ({
    id, title: id.toUpperCase(), description: '', category: 'graphics', layer: 'base',
    dir: path.join(root, 'lib', id),
  });
  const catalog: CatalogSkill[] = [
    skill('a'),
    skill('b'),
    {
      id: 'broken', title: 'X', description: '', category: 'graphics', layer: 'base',
      dir: null, error: 'SKILL.md не найден',
    },
  ];
  return { root, project: path.join(root, 'project'), catalog };
}

describe('skillTargetDir', () => {
  it('строит путь внутри .claude/skills', () => {
    expect(skillTargetDir('C:\\p', 'a')).toBe(path.join('C:\\p', '.claude', 'skills', 'a'));
  });

  it.each(['..', '../x', 'a/b', 'a\\b', ''])('отклоняет id «%s»', (id) => {
    expect(() => skillTargetDir('C:\\p', id)).toThrow();
  });
});

describe('installSkills', () => {
  it('копирует скиллы со вложенными файлами', async () => {
    const { project, catalog } = await setup();
    expect(await installSkills(project, catalog, ['a', 'b'])).toEqual([
      { skillId: 'a', status: 'installed' },
      { skillId: 'b', status: 'installed' },
    ]);
    expect(await readFile(path.join(project, '.claude', 'skills', 'a', 'ref', 'notes.md'), 'utf8')).toBe('n');
  });

  it('без overwrite не перезаписывает, с overwrite заменяет целиком', async () => {
    const { project, catalog } = await setup();
    await installSkills(project, catalog, ['a']);
    const extra = path.join(project, '.claude', 'skills', 'a', 'extra.txt');
    await writeFile(extra, 'old');
    expect(await installSkills(project, catalog, ['a'])).toEqual([{ skillId: 'a', status: 'already-installed' }]);
    expect(await installSkills(project, catalog, ['a'], { overwrite: true })).toEqual([
      { skillId: 'a', status: 'installed' },
    ]);
    expect(await exists(extra)).toBe(false);
  });

  it('ошибка одного скилла не мешает остальным', async () => {
    const { project, catalog } = await setup();
    expect(await installSkills(project, catalog, ['nope', 'broken', 'b'])).toEqual([
      { skillId: 'nope', status: 'error', message: 'Скилл не найден в каталоге' },
      { skillId: 'broken', status: 'error', message: 'SKILL.md не найден' },
      { skillId: 'b', status: 'installed' },
    ]);
  });
});

describe('getInstalled', () => {
  it('нет .claude — пусто', async () => {
    const { project, catalog } = await setup();
    expect(await getInstalled(project, catalog)).toEqual({});
  });

  it('up-to-date, outdated и unknown', async () => {
    const { root, project, catalog } = await setup();
    await installSkills(project, catalog, ['a', 'b']);
    await writeFiles(project, {
      '.claude/skills/foreign/SKILL.md': 'x',
      '.claude/skills/not-a-skill/readme.txt': 'x',
    });
    await writeFile(path.join(root, 'lib', 'b', 'SKILL.md'), '---\nname: B\n---\nновая версия');
    expect(await getInstalled(project, catalog)).toEqual({ a: 'up-to-date', b: 'outdated', foreign: 'unknown' });
  });

  it('исчезнувшая папка скилла в каталоге — unknown, остальные считаются', async () => {
    const { root, project, catalog } = await setup();
    await installSkills(project, catalog, ['a', 'b']);
    await rm(path.join(root, 'lib', 'b'), { recursive: true, force: true });
    expect(await getInstalled(project, catalog)).toEqual({ a: 'up-to-date', b: 'unknown' });
  });
});
