import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { updateMode, isNewer, isAppImageRun } = require('../../electron/updater.cjs') as {
  updateMode: (o: { platform: NodeJS.Platform; isPackaged: boolean; isAppImage: boolean }) => 'off' | 'auto' | 'notify';
  isNewer: (latest: unknown, current: unknown) => boolean;
  isAppImageRun: (o: { env: Record<string, string | undefined>; execPath: string; hasPackageType: boolean }) => boolean;
};

describe('isAppImageRun', () => {
  const appImageEnv = { APPIMAGE: '/home/u/Skill Manager.AppImage', APPDIR: '/tmp/.mount_SkillXy' };

  it('запуск из AppImage: APPIMAGE и APPDIR заданы, исполняемый файл внутри APPDIR', () => {
    expect(isAppImageRun({ env: appImageEnv, execPath: '/tmp/.mount_SkillXy/skill-manager', hasPackageType: false })).toBe(true);
  });

  it('.deb, запущенный из терминала AppImage-программы (APPIMAGE унаследован), — не AppImage', () => {
    expect(isAppImageRun({ env: appImageEnv, execPath: '/opt/Skill Manager/skill-manager', hasPackageType: true })).toBe(false);
    expect(isAppImageRun({ env: appImageEnv, execPath: '/opt/Skill Manager/skill-manager', hasPackageType: false })).toBe(false);
  });

  it('есть resources/package-type (deb/rpm/pacman) — не AppImage, даже если путь совпал', () => {
    expect(isAppImageRun({ env: appImageEnv, execPath: '/tmp/.mount_SkillXy/skill-manager', hasPackageType: true })).toBe(false);
  });

  it('без APPIMAGE или APPDIR — не AppImage', () => {
    expect(isAppImageRun({ env: {}, execPath: '/tmp/.mount_SkillXy/skill-manager', hasPackageType: false })).toBe(false);
    expect(isAppImageRun({ env: { APPIMAGE: appImageEnv.APPIMAGE }, execPath: '/tmp/.mount_SkillXy/skill-manager', hasPackageType: false })).toBe(false);
  });

  it('APPDIR — префикс пути, а не начало имени соседней папки', () => {
    expect(isAppImageRun({ env: appImageEnv, execPath: '/tmp/.mount_SkillXyZ/skill-manager', hasPackageType: false })).toBe(false);
  });
});

describe('updateMode', () => {
  it('выключено, пока приложение не собрано (разработка), на любой ОС', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      expect(updateMode({ platform, isPackaged: false, isAppImage: false })).toBe('off');
      expect(updateMode({ platform, isPackaged: false, isAppImage: true })).toBe('off');
    }
  });

  it('Windows обновляется сам', () => {
    expect(updateMode({ platform: 'win32', isPackaged: true, isAppImage: false })).toBe('auto');
  });

  it('Linux: AppImage обновляется сам, .deb — только уведомление', () => {
    expect(updateMode({ platform: 'linux', isPackaged: true, isAppImage: true })).toBe('auto');
    expect(updateMode({ platform: 'linux', isPackaged: true, isAppImage: false })).toBe('notify');
  });

  it('macOS без подписи — только уведомление', () => {
    expect(updateMode({ platform: 'darwin', isPackaged: true, isAppImage: false })).toBe('notify');
  });
});

describe('isNewer', () => {
  it('сравнивает части версии как числа, а не строки', () => {
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
  });

  it('старшая часть важнее младших', () => {
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
    expect(isNewer('0.1.1', '0.1.0')).toBe(true);
  });

  it('равные версии — не новее', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
  });

  it('понимает префикс v (теги релизов) с обеих сторон', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v0.2.0', 'v0.1.0')).toBe(true);
  });

  it('мусор — не новее', () => {
    for (const bad of ['', 'latest', '1.2', '1.2.3.4', 'v', '1.x.0', '1.0.0-beta.1', null, undefined, 42, {}]) {
      expect(isNewer(bad, '0.1.0')).toBe(false);
      expect(isNewer('9.9.9', bad)).toBe(false);
    }
  });
});
