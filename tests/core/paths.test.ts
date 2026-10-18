import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { resolveAppPaths } from '../../src/core/paths';

describe('resolveAppPaths', () => {
  it('по умолчанию использует папки внутри приложения', () => {
    expect(resolveAppPaths({ APPDATA: 'C:\\AppData' }, 'C:\\app')).toEqual({
      baseCatalogDir: path.join('C:\\app', 'catalog'),
      userDir: path.join('C:\\app', 'user'),
      cacheDir: path.join('C:\\app', '.cache'),
      vscodeStorage: path.join('C:\\AppData', 'Code', 'User', 'globalStorage', 'storage.json'),
      home: os.homedir(),
      trashDir: path.join('C:\\app', 'user', 'trash'),
    });
  });

  it('учитывает переменные окружения', () => {
    const p = resolveAppPaths(
      {
        APPDATA: 'C:\\AppData',
        SKILL_MANAGER_USER_DIR: 'D:\\my',
        SKILL_MANAGER_CATALOG_DIR: 'D:\\cat',
        SKILL_MANAGER_VSCODE_STORAGE: 'D:\\s.json',
        SKILL_MANAGER_HOME: 'D:\\home',
        SKILL_MANAGER_CACHE_DIR: 'D:\\cache',
      },
      'C:\\app',
    );
    expect(p.cacheDir).toBe('D:\\cache');
    expect(p.userDir).toBe('D:\\my');
    expect(p.baseCatalogDir).toBe('D:\\cat');
    expect(p.vscodeStorage).toBe('D:\\s.json');
    expect(p.home).toBe('D:\\home');
    expect(p.trashDir).toBe(path.join('D:\\my', 'trash'));
  });
});
