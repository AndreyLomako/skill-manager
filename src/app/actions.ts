'use server';

import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { CatalogError, loadCatalog } from '@/core/catalog';
import { getInstalled, installSkills } from '@/core/installer';
import { resolveAppPaths, type AppPaths } from '@/core/paths';
import { addManualProject, isKnownProject, listProjects, type ProjectsResult } from '@/core/projects';
import { skillsRoot } from '@/core/skill-targets';
import { ensureSource, sourceCacheDir } from '@/core/sources';
import type { Catalog, InstallResult, InstalledState, SourceDef } from '@/core/types';
import { addUserSkill, type NewUserSkill } from '@/core/user-catalog';

const exists = (p: string) => access(p).then(() => true, () => false);

export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; error: string };

const appPaths = () => resolveAppPaths();

const claudeRoot = (paths: AppPaths, projectPath: string) =>
  skillsRoot({ kind: 'project', path: projectPath }, 'claude', paths.home);

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
    return { ok: false, error: (e as Error).message };
  }
}

export async function getCatalogAction(update = false): Promise<CatalogResult> {
  try {
    return { ok: true, catalog: await loadCatalog(appPaths(), { update }) };
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function getInstalledAction(projectPath: string): Promise<InstalledState> {
  const paths = appPaths();
  if (!(await isKnownProject(paths, projectPath))) return {};
  const catalog = await loadCatalog(paths);
  return getInstalled(claudeRoot(paths, projectPath), catalog.skills);
}

export async function installSkillsAction(
  projectPath: string,
  ids: string[],
  overwrite = false,
): Promise<InstallResult[]> {
  const paths = appPaths();
  if (!(await isKnownProject(paths, projectPath))) {
    return ids.map((skillId) => ({ skillId, status: 'error' as const, message: 'Проект не найден в списке' }));
  }
  const catalog = await loadCatalog(paths);
  return installSkills(claudeRoot(paths, projectPath), catalog.skills, ids, { overwrite });
}

export async function addUserSkillAction(
  input: NewUserSkill,
): Promise<{ ok: true; skillId: string; catalog: CatalogResult } | { ok: false; error: string }> {
  try {
    const paths = appPaths();
    const { skillId } = await addUserSkill(paths.userDir, input, (src, skillPath) => verifyUserSkill(paths, src, skillPath));
    return { ok: true, skillId, catalog: await getCatalogAction(false) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
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
