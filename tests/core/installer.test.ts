import { afterEach, describe, expect, it } from 'vitest';
import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getInstalled, installSkills, skillTargetDir } from '../../src/core/installer';
import type { CatalogSkill } from '../../src/core/types';
import { catalogSkill } from '../helpers/skill';
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
  const skill = (id: string): CatalogSkill =>
    catalogSkill({ id, title: id.toUpperCase(), category: 'graphics', dir: path.join(root, 'lib', id) });
  const catalog: CatalogSkill[] = [
    skill('a'),
    skill('b'),
    catalogSkill({ id: 'broken', title: 'X', category: 'graphics', error: 'SKILL.md не найден' }),
  ];
  const project = path.join(root, 'project');
  return { root, project, skills: path.join(project, '.claude', 'skills'), catalog };
}

describe('skillTargetDir', () => {
  // Windows-only: «C:\\…» нативный path на posix считает относительным именем.
  it.runIf(process.platform === 'win32')('строит путь внутри .claude/skills', () => {
    expect(skillTargetDir('C:\\p\\.claude\\skills', 'a')).toBe(path.join('C:\\p', '.claude', 'skills', 'a'));
  });

  it.each(['..', '../x', 'a/b', 'a\\b', '', 'synced', '.trash'])('отклоняет id «%s»', (id) => {
    expect(() => skillTargetDir('C:\\p\\.claude\\skills', id)).toThrow();
  });
});

describe('installSkills', () => {
  it('копирует скиллы со вложенными файлами', async () => {
    const { project, skills, catalog } = await setup();
    expect(await installSkills(skills, catalog, ['a', 'b'], { agent: 'claude' })).toEqual([
      { skillId: 'a', status: 'installed' },
      { skillId: 'b', status: 'installed' },
    ]);
    expect(await readFile(path.join(project, '.claude', 'skills', 'a', 'ref', 'notes.md'), 'utf8')).toBe('n');
  });

  it('без overwrite не перезаписывает, с overwrite заменяет целиком', async () => {
    const { project, skills, catalog } = await setup();
    await installSkills(skills, catalog, ['a'], { agent: 'claude' });
    const extra = path.join(project, '.claude', 'skills', 'a', 'extra.txt');
    await writeFile(extra, 'old');
    expect(await installSkills(skills, catalog, ['a'], { agent: 'claude' })).toEqual([{ skillId: 'a', status: 'already-installed' }]);
    expect(await installSkills(skills, catalog, ['a'], { agent: 'claude', overwrite: true })).toEqual([
      { skillId: 'a', status: 'installed' },
    ]);
    expect(await exists(extra)).toBe(false);
  });

  it('overwrite с trash переносит старую копию в корзину и ставит новую', async () => {
    const { root, project, skills, catalog } = await setup();
    await installSkills(skills, catalog, ['a'], { agent: 'claude' });
    await writeFile(path.join(skills, 'a', 'extra.txt'), 'old');
    const trashDir = path.join(root, 'trash');
    expect(
      await installSkills(skills, catalog, ['a'], {
        agent: 'claude',
        overwrite: true,
        trash: { dir: trashDir, agent: 'claude', scope: 'project' },
      }),
    ).toEqual([{ skillId: 'a', status: 'installed' }]);
    expect(await exists(path.join(skills, 'a', 'extra.txt'))).toBe(false);
    expect(await readFile(path.join(project, '.claude', 'skills', 'a', 'ref', 'notes.md'), 'utf8')).toBe('n');
    const ids = await readdir(trashDir);
    expect(ids).toHaveLength(1);
    const entry = JSON.parse(await readFile(path.join(trashDir, ids[0], 'entry.json'), 'utf8'));
    expect(entry).toMatchObject({ name: 'a', agent: 'claude', scope: 'project', originalPath: path.join(skills, 'a') });
    expect(await readFile(path.join(trashDir, ids[0], 'skill', 'extra.txt'), 'utf8')).toBe('old');
  });

  it('ошибка одного скилла не мешает остальным', async () => {
    const { skills, catalog } = await setup();
    expect(await installSkills(skills, catalog, ['nope', 'broken', 'b'], { agent: 'claude' })).toEqual([
      { skillId: 'nope', status: 'error', message: 'Скилл не найден в каталоге' },
      { skillId: 'broken', status: 'error', message: 'SKILL.md не найден' },
      { skillId: 'b', status: 'installed' },
    ]);
  });
});

describe('getInstalled', () => {
  it('нет .claude — пусто', async () => {
    const { skills, catalog } = await setup();
    expect(await getInstalled(skills, catalog, 'claude')).toEqual({});
  });

  it('up-to-date, outdated и unknown', async () => {
    const { root, project, skills, catalog } = await setup();
    await installSkills(skills, catalog, ['a', 'b'], { agent: 'claude' });
    await writeFiles(project, {
      '.claude/skills/foreign/SKILL.md': 'x',
      '.claude/skills/not-a-skill/readme.txt': 'x',
      '.claude/skills/synced/x/SKILL.md': 'x',
      '.claude/skills/.trash/y/SKILL.md': 'x',
    });
    await writeFile(path.join(root, 'lib', 'b', 'SKILL.md'), '---\nname: B\n---\nновая версия');
    expect(await getInstalled(skills, catalog, 'claude')).toEqual({ a: 'up-to-date', b: 'outdated', foreign: 'unknown' });
  });

  it('исчезнувшая папка скилла в каталоге — unknown, остальные считаются', async () => {
    const { root, skills, catalog } = await setup();
    await installSkills(skills, catalog, ['a', 'b'], { agent: 'claude' });
    await rm(path.join(root, 'lib', 'b'), { recursive: true, force: true });
    expect(await getInstalled(skills, catalog, 'claude')).toEqual({ a: 'up-to-date', b: 'unknown' });
  });
});

describe('установка по агенту', () => {
  async function twoCopies() {
    const root = await tmpDir();
    await writeFiles(root, {
      'src/c/imp/SKILL.md': '---\nname: Imp\n---\nдля Claude',
      'src/a/imp/SKILL.md': '---\nname: Imp\n---\nдля Codex',
      'src/c/only/SKILL.md': '---\nname: Only\n---\n',
    });
    const catalog = [
      catalogSkill({ id: 'imp', dirs: { claude: path.join(root, 'src/c/imp'), codex: path.join(root, 'src/a/imp') } }),
      catalogSkill({ id: 'only', title: 'Only', dirs: { claude: path.join(root, 'src/c/only') } }),
    ];
    return { root, catalog };
  }

  it('ставит копию своего агента', async () => {
    const { root, catalog } = await twoCopies();
    const claude = path.join(root, 'p/.claude/skills');
    const codex = path.join(root, 'p/.agents/skills');
    await installSkills(claude, catalog, ['imp'], { agent: 'claude' });
    await installSkills(codex, catalog, ['imp'], { agent: 'codex' });
    expect(await readFile(path.join(claude, 'imp/SKILL.md'), 'utf8')).toContain('для Claude');
    expect(await readFile(path.join(codex, 'imp/SKILL.md'), 'utf8')).toContain('для Codex');
  });

  it('нет копии для агента — unsupported, папка не создаётся', async () => {
    const { root, catalog } = await twoCopies();
    const codex = path.join(root, 'p/.agents/skills');
    expect(await installSkills(codex, catalog, ['only'], { agent: 'codex' })).toEqual([
      { skillId: 'only', status: 'unsupported', message: 'нет версии для Codex' },
    ]);
    expect(await exists(path.join(codex, 'only'))).toBe(false);
  });

  it('getInstalled сравнивает с копией агента и смотрит во все корни', async () => {
    const { root, catalog } = await twoCopies();
    const agents = path.join(root, 'home/.agents/skills');
    const legacy = path.join(root, 'home/.codex/skills');
    await installSkills(legacy, catalog, ['imp'], { agent: 'codex' });
    expect(await getInstalled([agents, legacy], catalog, 'codex')).toEqual({ imp: 'up-to-date' });
    expect(await getInstalled([agents, legacy], catalog, 'claude')).toEqual({ imp: 'outdated' });
  });
});
