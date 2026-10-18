import os from 'node:os';
import path from 'node:path';

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
): AppPaths {
  const userDir = env.SKILL_MANAGER_USER_DIR ?? path.join(root, 'user');
  return {
    baseCatalogDir: env.SKILL_MANAGER_CATALOG_DIR ?? path.join(root, 'catalog'),
    userDir,
    cacheDir: env.SKILL_MANAGER_CACHE_DIR ?? path.join(root, '.cache'),
    vscodeStorage:
      env.SKILL_MANAGER_VSCODE_STORAGE ??
      path.join(env.APPDATA ?? '', 'Code', 'User', 'globalStorage', 'storage.json'),
    home: env.SKILL_MANAGER_HOME ?? os.homedir(),
    trashDir: path.join(userDir, 'trash'),
  };
}
