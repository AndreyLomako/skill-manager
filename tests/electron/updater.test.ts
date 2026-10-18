import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { updateMode, isNewer } = require('../../electron/updater.cjs') as {
  updateMode: (o: { platform: NodeJS.Platform; isPackaged: boolean; isAppImage: boolean }) => 'off' | 'auto' | 'notify';
  isNewer: (latest: unknown, current: unknown) => boolean;
};

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
