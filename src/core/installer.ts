import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { hashDir } from './hash';
import { isReservedSkillName, isValidSkillName } from './skill-targets';
import { moveToTrash } from './trash';
import type { AgentId, CatalogSkill, InstallResult, InstalledState } from './types';

const exists = (p: string) => access(p).then(() => true, () => false);

export function skillTargetDir(root: string, skillId: string): string {
  if (!isValidSkillName(skillId)) throw new Error(`Недопустимый id скилла: ${skillId}`);
  return path.join(path.resolve(root), skillId);
}

export async function installSkills(
  root: string,
  catalog: CatalogSkill[],
  ids: string[],
  opts: { overwrite?: boolean; trash?: { dir: string; agent: AgentId; scope: 'project' | 'global' } } = {},
): Promise<InstallResult[]> {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const results: InstallResult[] = [];
  for (const id of ids) {
    try {
      const skill = byId.get(id);
      if (!skill) throw new Error('Скилл не найден в каталоге');
      if (!skill.dir) throw new Error(skill.error ?? 'Скилл недоступен');
      const target = skillTargetDir(root, id);
      if (await exists(target)) {
        if (!opts.overwrite) {
          results.push({ skillId: id, status: 'already-installed' });
          continue;
        }
        // С корзиной прежняя версия переносится туда (обратимо), иначе удаляется.
        if (opts.trash) {
          const { dir, agent, scope } = opts.trash;
          await moveToTrash(dir, target, { name: id, agent, scope });
        } else {
          await rm(target, { recursive: true, force: true });
        }
      }
      await mkdir(path.dirname(target), { recursive: true });
      await cp(skill.dir, target, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
      results.push({ skillId: id, status: 'installed' });
    } catch (e) {
      results.push({ skillId: id, status: 'error', message: (e as Error).message });
    }
  }
  return results;
}

export async function getInstalled(root: string, catalog: CatalogSkill[]): Promise<InstalledState> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return {};
  }
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const state: InstalledState = {};
  for (const name of names) {
    if (isReservedSkillName(name)) continue;
    const dir = path.join(root, name);
    if (!(await exists(path.join(dir, 'SKILL.md')))) continue;
    const skill = byId.get(name);
    if (!skill?.dir) {
      state[name] = 'unknown';
      continue;
    }
    try {
      state[name] = (await hashDir(skill.dir)) === (await hashDir(dir)) ? 'up-to-date' : 'outdated';
    } catch {
      state[name] = 'unknown';
    }
  }
  return state;
}
