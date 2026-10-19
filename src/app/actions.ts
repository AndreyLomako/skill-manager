'use server';

import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { CatalogError, loadCatalog } from '@/core/catalog';
import { getInstalled, installSkills } from '@/core/installer';
import { resolveAppPaths, type AppPaths } from '@/core/paths';
import { addManualProject, isKnownProject, listProjects, type ProjectsResult } from '@/core/projects';
import { listInstalled } from '@/core/inventory';
import { isForbiddenProjectRoot, skillRoots, skillsRoot, parseAgents } from '@/core/skill-targets';
import { purgeTrash, removeSkill, restoreFromTrash } from '@/core/trash';
import { ensureSource, sourceCacheDir } from '@/core/sources';
import type {
  AgentId,
  Catalog,
  InstallResult,
  InstalledSkill,
  InstalledState,
  Scope,
  SourceDef,
  TrashEntry,
} from '@/core/types';
import { addUserSkill, type NewUserSkill } from '@/core/user-catalog';

const exists = (p: string) => access(p).then(() => true, () => false);

export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; error: string };

const appPaths = () => resolveAppPaths();

export async function getProjectsAction(): Promise<ProjectsResult> {
  return listProjects(appPaths());
}

export async function addProjectAction(
  projectPath: string,
): Promise<{ ok: true; path: string; result: ProjectsResult } | { ok: false; error: string }> {
  try {
    const saved = await addManualProject(appPaths(), projectPath);
    return { ok: true, path: saved, result: await listProjects(appPaths()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** clone = false — не клонировать отсутствующие git-источники (первая отрисовка не ждёт сеть). */
export async function getCatalogAction(update = false, clone = true): Promise<CatalogResult> {
  try {
    return { ok: true, catalog: await loadCatalog(appPaths(), { update, clone }) };
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, error: e.message };
    throw e;
  }
}

async function checkScope(paths: AppPaths, scope: unknown): Promise<Scope | null> {
  if (!scope || typeof scope !== 'object') return null;
  const s = scope as { kind?: unknown; path?: unknown };
  if (s.kind === 'global') return { kind: 'global' };
  if (
    s.kind === 'project' &&
    typeof s.path === 'string' &&
    !isForbiddenProjectRoot(s.path, paths.home) &&
    (await isKnownProject(paths, s.path))
  ) {
    return { kind: 'project', path: path.resolve(s.path) };
  }
  return null;
}

const UNKNOWN_SCOPE = 'Проект не найден в списке';

export async function getInstalledAction(
  scope: Scope,
  agents: AgentId[],
): Promise<Partial<Record<AgentId, InstalledState>>> {
  const paths = appPaths();
  const checked = await checkScope(paths, scope);
  if (!checked) return {};
  const catalog = await loadCatalog(paths);
  const out: Partial<Record<AgentId, InstalledState>> = {};
  for (const agent of parseAgents(agents)) {
    out[agent] = await getInstalled(skillRoots(checked, agent, paths.home), catalog.skills, agent);
  }
  return out;
}

export async function installSkillsAction(
  scope: Scope,
  agents: AgentId[],
  ids: string[],
  overwrite = false,
): Promise<InstallResult[]> {
  const paths = appPaths();
  ids = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  const list = parseAgents(agents);
  const checked = await checkScope(paths, scope);
  if (!checked) {
    return list.flatMap((agent) =>
      ids.map((skillId) => ({ skillId, status: 'error' as const, message: UNKNOWN_SCOPE, agent })),
    );
  }
  const catalog = await loadCatalog(paths);
  const out: InstallResult[] = [];
  for (const agent of list) {
    const results = await installSkills(skillsRoot(checked, agent, paths.home), catalog.skills, ids, {
      agent,
      overwrite,
      trash: { dir: paths.trashDir, agent, scope: checked.kind },
    });
    out.push(...results.map((r) => ({ ...r, agent })));
  }
  return out;
}

export async function listInstalledAction(scope: Scope, agents: AgentId[]): Promise<InstalledSkill[]> {
  const paths = appPaths();
  const checked = await checkScope(paths, scope);
  if (!checked) return [];
  await purgeTrash(paths.trashDir).catch(() => undefined);
  const catalog = await loadCatalog(paths);
  return listInstalled(checked, parseAgents(agents), paths.home, catalog.skills);
}

export async function removeSkillAction(
  scope: Scope,
  agent: AgentId,
  name: string,
  root?: string,
): Promise<{ ok: true; entry: TrashEntry } | { ok: false; error: string }> {
  const paths = appPaths();
  if (typeof name !== 'string') return { ok: false, error: 'Некорректное имя' };
  if (root !== undefined && typeof root !== 'string') return { ok: false, error: 'Некорректная папка' };
  const checked = await checkScope(paths, scope);
  if (!checked) return { ok: false, error: UNKNOWN_SCOPE };
  if (agent !== 'claude' && agent !== 'codex') return { ok: false, error: 'Неизвестный агент' };
  try {
    return { ok: true, entry: await removeSkill(checked, agent, name, paths.home, paths.trashDir, root) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function restoreSkillAction(
  id: string,
): Promise<{ ok: true; entry: TrashEntry } | { ok: false; error: string }> {
  const paths = appPaths();
  if (typeof id !== 'string') return { ok: false, error: 'Некорректный id' };
  try {
    const entry = await restoreFromTrash(paths.trashDir, id, {
      home: paths.home,
      isAllowedProject: (p) => isKnownProject(paths, p),
    });
    return { ok: true, entry };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addUserSkillAction(
  input: NewUserSkill,
): Promise<{ ok: true; skillId: string; catalog: CatalogResult } | { ok: false; error: string }> {
  try {
    const paths = appPaths();
    const { skillId } = await addUserSkill(paths.userDir, input, (src, skillPath) => verifyUserSkill(paths, src, skillPath));
    return { ok: true, skillId, catalog: await getCatalogAction(false) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function verifyUserSkill(paths: AppPaths, src: SourceDef, skillPath: string): Promise<void> {
  // Свежий клон, сделанный только ради проверки, удаляем при неудаче, чтобы его
  // не подхватил другой источник с тем же id.
  const cache = src.type === 'git' ? sourceCacheDir(paths.cacheDir, 'user', src.id) : null;
  const hadCache = cache ? await exists(path.join(cache, '.git')) : true;
  try {
    const dir = await ensureSource(src, {
      layer: 'user',
      manifestDir: paths.userDir,
      cacheDir: paths.cacheDir,
      update: false,
    });
    if (!(await exists(path.join(dir, skillPath, 'SKILL.md')))) {
      throw new Error(`SKILL.md не найден по пути «${skillPath}»`);
    }
  } catch (e) {
    if (cache && !hadCache) await rm(cache, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
