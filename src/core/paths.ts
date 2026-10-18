import os from 'node:os';
import path from 'node:path';
import { vscodeStoragePath } from './platform';

export const BASE_MANIFEST = 'catalog.json';
export const USER_MANIFEST = 'user-catalog.json';

export interface AppPaths {
  baseCatalogDir: string;
  userDir: string;
  cacheDir: string;
  vscodeStorage: string;
  home: string;
  trashDir: string;
}

export function resolveAppPaths(
  env: Record<string, string | undefined> = process.env,
  root: string = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): AppPaths {
  const home = env.SKILL_MANAGER_HOME ?? os.homedir();
  const userDir = env.SKILL_MANAGER_USER_DIR ?? path.join(root, 'user');
  return {
    baseCatalogDir: env.SKILL_MANAGER_CATALOG_DIR ?? path.join(root, 'catalog'),
    userDir,
    cacheDir: env.SKILL_MANAGER_CACHE_DIR ?? path.join(root, '.cache'),
    vscodeStorage: env.SKILL_MANAGER_VSCODE_STORAGE ?? vscodeStoragePath(env, home, platform),
    home,
    trashDir: path.join(userDir, 'trash'),
  };
}
