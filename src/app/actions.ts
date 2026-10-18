'use server';

import { CatalogError, loadCatalog } from '@/core/catalog';
import { getInstalled, installSkills } from '@/core/installer';
import { resolveAppPaths } from '@/core/paths';
import { addManualProject, isKnownProject, listProjects, type ProjectsResult } from '@/core/projects';
import type { Catalog, InstallResult, InstalledState } from '@/core/types';
import { addUserSkill, type NewUserSkill } from '@/core/user-catalog';

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
  return getInstalled(projectPath, catalog.skills);
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
  return installSkills(projectPath, catalog.skills, ids, { overwrite });
}

export async function addUserSkillAction(
  input: NewUserSkill,
): Promise<{ ok: true; skillId: string; catalog: CatalogResult } | { ok: false; error: string }> {
  try {
    const { skillId } = await addUserSkill(appPaths().userDir, input);
    return { ok: true, skillId, catalog: await getCatalogAction(false) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
