import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listTrash, purgeTrash, removeSkill, restoreFromTrash } from '../../src/core/trash';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const exists = (p: string) => access(p).then(() => true, () => false);

const allow = (home: string) => ({ home, isAllowedProject: async () => true });

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

    await restoreFromTrash(trash, entry.id, { home, isAllowedProject: async () => true });
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
    await expect(restoreFromTrash(trash, entry.id, allow(home))).rejects.toThrow(/уже есть/);
  });

  it.each(['synced', '../x', 'a/b', '.trash'])('нельзя удалить «%s»', async (name) => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', name, home, trash)).rejects.toThrow(/нельзя/);
  });

  it('несуществующий скилл и неверный id корзины', async () => {
    const { home, trash } = await setup();
    await expect(removeSkill({ kind: 'global' }, 'claude', 'nope', home, trash)).rejects.toThrow(/не найден/);
    await expect(restoreFromTrash(trash, '../../evil', allow(home))).rejects.toThrow(/id/);
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

async function tamper(trash: string, id: string, patch: Record<string, unknown>) {
  const f = path.join(trash, id, 'entry.json');
  const e = JSON.parse(await readFile(f, 'utf8'));
  await writeFile(f, JSON.stringify({ ...e, ...patch }), 'utf8');
}

describe('restoreFromTrash: entry.json не доверяется', () => {
  it.each([
    ['synced', 'synced'],
    ['pdf', 'synced'],
  ])('originalPath в synced (name=%s) отклоняется', async (name, dirName) => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    const target = path.join(home, '.claude', 'skills', dirName);
    await tamper(trash, entry.id, { name, originalPath: target });
    await expect(restoreFromTrash(trash, entry.id, allow(home))).rejects.toThrow('Некорректный путь восстановления');
    expect(await exists(path.join(home, '.claude', 'skills', 'synced', 'SKILL.md'))).toBe(false);
    expect(await exists(path.join(trash, entry.id, 'skill'))).toBe(true);
  });

  it('проект не из списка разрешённых отклоняется', async () => {
    const { root, home, trash } = await setup();
    const entry = await removeSkill({ kind: 'project', path: path.join(root, 'proj') }, 'codex', 'local', home, trash);
    await expect(restoreFromTrash(trash, entry.id, { home, isAllowedProject: async () => false })).rejects.toThrow(
      'Некорректный путь восстановления',
    );
    expect(await exists(path.join(root, 'proj', '.agents', 'skills', 'local'))).toBe(false);
    await restoreFromTrash(trash, entry.id, allow(home));
    expect(await exists(path.join(root, 'proj', '.agents', 'skills', 'local', 'SKILL.md'))).toBe(true);
  });

  it('несовпадение agent/name с путём отклоняется', async () => {
    const { home, trash } = await setup();
    const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
    await tamper(trash, entry.id, { agent: 'codex' });
    await expect(restoreFromTrash(trash, entry.id, allow(home))).rejects.toThrow('Некорректный путь восстановления');
    await tamper(trash, entry.id, { agent: 'claude', name: 'other' });
    await expect(restoreFromTrash(trash, entry.id, allow(home))).rejects.toThrow('Некорректный путь восстановления');
  });

  it.each([{ id: 'x' }, { agent: 'gemini' }, { scope: 'weird' }, { name: '..' }, { originalPath: 5 }, { originalPath: 'rel/path' }])(
    'битая запись %j даёт понятную ошибку',
    async (patch) => {
      const { home, trash } = await setup();
      const entry = await removeSkill({ kind: 'global' }, 'claude', 'pdf', home, trash);
      await tamper(trash, entry.id, patch);
      const err = await restoreFromTrash(trash, entry.id, allow(home)).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(TypeError);
    },
  );

  it('запись без полей — обычная Error', async () => {
    const { home, trash } = await setup();
    await mkdir(path.join(trash, '1-abc'), { recursive: true });
    await writeFile(path.join(trash, '1-abc', 'entry.json'), '{}', 'utf8');
    const err = await restoreFromTrash(trash, '1-abc', allow(home)).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TypeError);
  });
});

describe('moveToTrash: без потери данных', () => {
  it('неудачный перенос не оставляет папку корзины', async () => {
    const { root, home, trash } = await setup();
    const { moveToTrash } = await import('../../src/core/trash');
    await expect(
      moveToTrash(trash, path.join(root, 'nope'), { name: 'nope', agent: 'claude', scope: 'global' }),
    ).rejects.toThrow();
    expect(await exists(trash) ? await listDir(trash) : []).toEqual([]);
    expect(await exists(path.join(home, '.claude', 'skills', 'pdf'))).toBe(true);
  });
});

describe('moveToTrash: EXDEV, копирование удалось, удаление источника — нет', () => {
  it('сохраняет копию в корзине и сообщает об этом', async () => {
    const { home, trash } = await setup();
    const { moveToTrash } = await import('../../src/core/trash');
    const { cp, rm } = await import('node:fs/promises');
    const dir = path.join(home, '.claude', 'skills', 'pdf');
    const exdev = Object.assign(new Error('x'), { code: 'EXDEV' });
    const ops = {
      rename: async () => {
        throw exdev;
      },
      cp,
      rm: async () => {
        throw new Error('EBUSY locked');
      },
    };
    const err = await moveToTrash(trash, dir, { name: 'pdf', agent: 'claude', scope: 'global' }, 1000, ops).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/корзин/);
    expect(err.message).toMatch(/EBUSY locked/);
    const [entry] = await listTrash(trash);
    expect(entry).toBeTruthy();
    expect(await exists(path.join(trash, entry.id, 'skill', 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(trash, entry.id, 'entry.json'))).toBe(true);
    void rm;
  });

  it('если копирование не удалось, папка корзины убирается', async () => {
    const { home, trash } = await setup();
    const { moveToTrash } = await import('../../src/core/trash');
    const dir = path.join(home, '.claude', 'skills', 'pdf');
    const ops = {
      rename: async () => {
        throw Object.assign(new Error('x'), { code: 'EXDEV' });
      },
      cp: async () => {
        throw new Error('cp failed');
      },
      rm: async () => {},
    };
    await expect(
      moveToTrash(trash, dir, { name: 'pdf', agent: 'claude', scope: 'global' }, 1000, ops),
    ).rejects.toThrow('cp failed');
    expect(await listTrash(trash)).toEqual([]);
    expect(await exists(path.join(dir, 'SKILL.md'))).toBe(true);
  });
});

describe('restoreFromTrash: канонический путь проекта', () => {
  it('isAllowedProject получает path.resolve без «..»', async () => {
    const { root, home, trash } = await setup();
    const proj = path.join(root, 'proj');
    const entry = await removeSkill({ kind: 'project', path: proj }, 'codex', 'local', home, trash);
    const messy = [proj, 'zzz', '..', '.agents', 'skills', 'local'].join(path.sep); // join() бы нормализовал
    await tamper(trash, entry.id, { originalPath: messy });
    const seen: string[] = [];
    await restoreFromTrash(trash, entry.id, {
      home,
      isAllowedProject: async (p) => {
        seen.push(p);
        return true;
      },
    });
    expect(seen).toEqual([path.resolve(proj)]);
  });
});

async function listDir(d: string) {
  return (await import('node:fs/promises')).readdir(d);
}

describe('purgeTrash: папки без entry.json', () => {
  it('свежая папка с id переживает чистку, старая удаляется', async () => {
    const { trash } = await setup();
    const now = 10_000_000;
    await mkdir(path.join(trash, `${now - 10}-abc`), { recursive: true });
    await mkdir(path.join(trash, `${now - 5000}-def`), { recursive: true });
    expect(await purgeTrash(trash, 1000, now)).toBe(1);
    expect(await exists(path.join(trash, `${now - 10}-abc`))).toBe(true);
    expect(await exists(path.join(trash, `${now - 5000}-def`))).toBe(false);
  });

  it('не-id папки судятся по mtime', async () => {
    const { trash } = await setup();
    const fresh = path.join(trash, 'fresh');
    const old = path.join(trash, 'old');
    await mkdir(fresh, { recursive: true });
    await mkdir(old, { recursive: true });
    const now = Date.now();
    await utimes(old, new Date(now - 100_000), new Date(now - 100_000));
    expect(await purgeTrash(trash, 50_000, now)).toBe(1);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(old)).toBe(false);
  });
});
