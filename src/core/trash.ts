import { access, cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { renameWithRetry, writeJsonAtomic } from './json-file';
import { isValidSkillName, skillsRoot } from './skill-targets';
import type { AgentId, Scope, TrashEntry } from './types';

const ENTRY = 'entry.json';
const SKILL = 'skill';
const ID = /^\d+-[a-z0-9]+$/;
const DAY = 24 * 60 * 60 * 1000;
const exists = (p: string) => access(p).then(() => true, () => false);

async function move(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await renameWithRetry(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

export async function moveToTrash(
  trashDir: string,
  dir: string,
  meta: { name: string; agent: AgentId; scope: 'project' | 'global' },
  now = Date.now(),
): Promise<TrashEntry> {
  const id = `${now}-${randomBytes(4).toString('hex').slice(0, 6)}`;
  const entry: TrashEntry = { id, ...meta, originalPath: path.resolve(dir), deletedAt: now };
  // Сначала запись, потом перенос: при сбое переноса скилл остаётся на месте, корзину чистим.
  await writeJsonAtomic(path.join(trashDir, id, ENTRY), entry);
  try {
    await move(dir, path.join(trashDir, id, SKILL));
  } catch (e) {
    await rm(path.join(trashDir, id), { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  return entry;
}

async function readEntry(trashDir: string, id: string): Promise<TrashEntry | null> {
  try {
    return JSON.parse(await readFile(path.join(trashDir, id, ENTRY), 'utf8')) as TrashEntry;
  } catch {
    return null;
  }
}

export async function listTrash(trashDir: string): Promise<TrashEntry[]> {
  let ids: string[];
  try {
    ids = (await readdir(trashDir)).filter((n) => ID.test(n));
  } catch {
    return [];
  }
  const out: TrashEntry[] = [];
  for (const id of ids) {
    const e = await readEntry(trashDir, id);
    if (e) out.push(e);
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}

const BAD_TARGET = 'Некорректный путь восстановления';

export async function restoreFromTrash(
  trashDir: string,
  id: string,
  opts: { home: string; isAllowedProject: (projectPath: string) => Promise<boolean> },
): Promise<TrashEntry> {
  if (!ID.test(id)) throw new Error('Неверный id корзины');
  const entry = await readEntry(trashDir, id);
  if (!entry || typeof entry !== 'object') throw new Error('Запись в корзине не найдена');
  const { agent, scope, name, originalPath } = entry;
  if (
    entry.id !== id ||
    (agent !== 'claude' && agent !== 'codex') ||
    (scope !== 'project' && scope !== 'global') ||
    typeof name !== 'string' ||
    !isValidSkillName(name) ||
    typeof originalPath !== 'string' ||
    !path.isAbsolute(originalPath)
  ) {
    throw new Error(BAD_TARGET);
  }
  let expected: string;
  if (scope === 'global') {
    expected = path.join(skillsRoot({ kind: 'global' }, agent, opts.home), name);
  } else {
    const projectPath = path.dirname(path.dirname(path.dirname(originalPath)));
    if (!(await opts.isAllowedProject(projectPath))) throw new Error(BAD_TARGET);
    expected = path.join(skillsRoot({ kind: 'project', path: projectPath }, agent, opts.home), name);
  }
  if (path.resolve(originalPath).toLowerCase() !== path.resolve(expected).toLowerCase()) throw new Error(BAD_TARGET);
  if (await exists(expected)) throw new Error('На месте уже есть скилл с таким именем');
  await move(path.join(trashDir, id, SKILL), expected);
  await rm(path.join(trashDir, id), { recursive: true, force: true }).catch(() => {});
  return entry;
}

export async function purgeTrash(trashDir: string, maxAgeMs = 30 * DAY, now = Date.now()): Promise<number> {
  let names: string[];
  try {
    names = await readdir(trashDir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const entry = ID.test(name) ? await readEntry(trashDir, name) : null;
    let stamp: number | null = entry ? entry.deletedAt : null;
    if (typeof stamp !== 'number' || Number.isNaN(stamp)) {
      const prefix = /^(\d+)-/.exec(name);
      stamp = prefix ? Number(prefix[1]) : null;
      if (stamp === null) {
        try {
          stamp = (await stat(path.join(trashDir, name))).mtimeMs;
        } catch {
          continue;
        }
      }
    }
    if (stamp >= now - maxAgeMs) continue;
    await rm(path.join(trashDir, name), { recursive: true, force: true });
    removed++;
  }
  return removed;
}

export async function removeSkill(
  scope: Scope,
  agent: AgentId,
  name: string,
  home: string,
  trashDir: string,
): Promise<TrashEntry> {
  if (!isValidSkillName(name)) throw new Error('Этот скилл нельзя удалить');
  const dir = path.join(skillsRoot(scope, agent, home), name);
  if (!(await exists(path.join(dir, 'SKILL.md')))) throw new Error('Скилл не найден');
  return moveToTrash(trashDir, dir, { name, agent, scope: scope.kind });
}
