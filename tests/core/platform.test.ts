import { describe, expect, it, vi } from 'vitest';
import { isProcessRunning, pathApi, pathKey, vscodeStoragePath } from '../../src/core/platform';

describe('vscodeStoragePath', () => {
  it('win32: %APPDATA%\\Code\\User\\globalStorage\\storage.json', () => {
    expect(vscodeStoragePath({ APPDATA: 'C:\\AppData' }, 'C:\\Users\\u', 'win32')).toBe(
      'C:\\AppData\\Code\\User\\globalStorage\\storage.json',
    );
  });

  it('darwin: ~/Library/Application Support', () => {
    expect(vscodeStoragePath({}, '/Users/u', 'darwin')).toBe(
      '/Users/u/Library/Application Support/Code/User/globalStorage/storage.json',
    );
  });

  it('linux: ~/.config по умолчанию', () => {
    expect(vscodeStoragePath({}, '/home/u', 'linux')).toBe('/home/u/.config/Code/User/globalStorage/storage.json');
  });

  it('linux: учитывает XDG_CONFIG_HOME, пустое значение игнорируется', () => {
    expect(vscodeStoragePath({ XDG_CONFIG_HOME: '/x/cfg' }, '/home/u', 'linux')).toBe(
      '/x/cfg/Code/User/globalStorage/storage.json',
    );
    expect(vscodeStoragePath({ XDG_CONFIG_HOME: '' }, '/home/u', 'linux')).toBe(
      '/home/u/.config/Code/User/globalStorage/storage.json',
    );
  });
});

describe('pathKey', () => {
  it('win32 и darwin без учёта регистра, linux с учётом', () => {
    expect(pathKey('C:\\Work\\A', 'win32')).toBe('c:\\work\\a');
    expect(pathKey('/Users/U/A', 'darwin')).toBe('/users/u/a');
    expect(pathKey('/home/U/A', 'linux')).toBe('/home/U/A');
  });
});

describe('pathApi', () => {
  it('win32 -> path.win32, остальные -> path.posix', () => {
    expect(pathApi('win32').sep).toBe('\\');
    expect(pathApi('darwin').sep).toBe('/');
    expect(pathApi('linux').sep).toBe('/');
  });
});

describe('isProcessRunning', () => {
  const names = { win32: 'Code.exe', darwin: 'Code', linux: 'code' };

  it('win32: tasklist с фильтром, совпадение без учёта регистра', async () => {
    const run = vi.fn(async (_cmd: string, _args: string[]) => ({ code: 0, stdout: 'code.exe    1234 Console' }));
    expect(await isProcessRunning(names, 'win32', run)).toBe(true);
    expect(run).toHaveBeenCalledWith('tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH']);
  });

  it('win32: «INFO: No tasks» не считается запущенным', async () => {
    const run = async () => ({ code: 0, stdout: 'INFO: No tasks are running which match the specified criteria.' });
    expect(await isProcessRunning(names, 'win32', run)).toBe(false);
  });

  it.each([
    ['darwin', ['-x', 'Code']],
    ['linux', ['-x', 'code']],
  ] as const)('%s: строковое имя -> pgrep -x, код 0 = запущен', async (platform, args) => {
    const run = vi.fn(async (_cmd: string, _args: string[]) => ({ code: 0, stdout: '42\n' }));
    expect(await isProcessRunning(names, platform, run)).toBe(true);
    expect(run).toHaveBeenCalledWith('pgrep', [...args]);
    expect(await isProcessRunning(names, platform, async () => ({ code: 1, stdout: '' }))).toBe(false);
  });

  it('pgrep-запись передаёт аргументы как есть', async () => {
    const run = vi.fn(async (_cmd: string, _args: string[]) => ({ code: 0, stdout: '42\n' }));
    const custom = { darwin: { pgrep: ['-f', 'Visual Studio Code.app/Contents/MacOS/'] } };
    expect(await isProcessRunning(custom, 'darwin', run)).toBe(true);
    expect(run).toHaveBeenCalledWith('pgrep', ['-f', 'Visual Studio Code.app/Contents/MacOS/']);
  });

  it('не бросает: ошибка запуска и отсутствие имени дают false', async () => {
    const boom = async (): Promise<{ code: number; stdout: string }> => {
      throw new Error('ENOENT');
    };
    expect(await isProcessRunning(names, 'linux', boom)).toBe(false);
    expect(await isProcessRunning(names, 'win32', boom)).toBe(false);
    const run = vi.fn(async (_cmd: string, _args: string[]) => ({ code: 0, stdout: '' }));
    expect(await isProcessRunning({ win32: 'x.exe' }, 'linux', run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
