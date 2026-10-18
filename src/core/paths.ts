import path from 'node:path';

export const BASE_MANIFEST = 'catalog.json';
export const USER_MANIFEST = 'user-catalog.json';

export interface AppPaths {
  baseCatalogDir: string;
  userDir: string;
  cacheDir: string;
  vscodeStorage: string;
}

export function resolveAppPaths(
  env: Record<string, string | undefined> = process.env,
  root: string = process.cwd(),
): AppPaths {
  return {
    baseCatalogDir: env.SKILL_MANAGER_CATALOG_DIR ?? path.join(root, 'catalog'),
    userDir: env.SKILL_MANAGER_USER_DIR ?? path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage:
      env.SKILL_MANAGER_VSCODE_STORAGE ??
      path.join(env.APPDATA ?? '', 'Code', 'User', 'globalStorage', 'storage.json'),
  };
}
