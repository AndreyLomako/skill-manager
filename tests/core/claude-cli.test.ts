import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { findClaudeCli, isPluginId, uninstallPlugin, type ClaudeCli } from '../../src/core/claude-cli';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const platform = process.platform;
const exe = platform === 'win32' ? 'claude.exe' : 'claude';
const extDir = (ver: string) => `anthropic.claude-code-${ver}${platform === 'win32' ? '-win32-x64' : ''}`;

describe('findClaudeCli', () => {
  it('клиент в PATH важнее расширения VS Code', async () => {
    const root = await tmpDir();
    await writeFiles(root, {
      [`bin/${exe}`]: '',
      [`home/.vscode/extensions/${extDir('2.1.304')}/resources/native-binary/${exe}`]: '',
    });
    const cli = await findClaudeCli({ env: { PATH: path.join(root, 'bin') }, home: path.join(root, 'home'), platform });
    expect(cli).toEqual({ path: path.join(root, 'bin', exe), source: 'cli' });
  });

  it('без клиента — самая новая версия расширения (VS Code, Cursor и др.)', async () => {
    const root = await tmpDir();
    await writeFiles(root, {
      [`home/.vscode/extensions/${extDir('2.1.9')}/resources/native-binary/${exe}`]: '',
      [`home/.vscode/extensions/${extDir('2.1.30')}/resources/native-binary/${exe}`]: '',
      [`home/.cursor/extensions/${extDir('2.1.12')}/resources/native-binary/${exe}`]: '',
      'home/.vscode/extensions/other.ext-9.9.9/resources/native-binary/x': '',
    });
    const cli = await findClaudeCli({ env: { PATH: '' }, home: path.join(root, 'home'), platform });
    expect(cli).toEqual({
      path: path.join(root, 'home', '.vscode', 'extensions', extDir('2.1.30'), 'resources', 'native-binary', exe),
      source: 'vscode',
    });
  });

  it('нативный установщик в ~/.local/bin', async () => {
    const root = await tmpDir();
    await writeFiles(root, { [`home/.local/bin/${exe}`]: '' });
    const cli = await findClaudeCli({ env: {}, home: path.join(root, 'home'), platform });
    expect(cli).toEqual({ path: path.join(root, 'home', '.local', 'bin', exe), source: 'cli' });
  });

  it('ничего не найдено — null', async () => {
    const root = await tmpDir();
    expect(await findClaudeCli({ env: { PATH: root }, home: root, platform })).toBeNull();
  });

  it('Windows: claude.cmd из npm тоже подходит', async () => {
    const root = await tmpDir();
    await writeFiles(root, { 'npm/claude.cmd': '' });
    const cli = await findClaudeCli({ env: { Path: path.join(root, 'npm') }, home: root, platform: 'win32' });
    expect(cli).toEqual({ path: path.join(root, 'npm', 'claude.cmd'), source: 'cli' });
  });
});

describe('uninstallPlugin', () => {
  const cli: ClaudeCli = { path: '/x/claude', source: 'cli' };

  it.each(['', 'superpowers', '-rf@m', 'a@b;calc', 'a b@c', 'a@b@c', 'a@-m'])('отклоняет id «%s», ничего не запуская', async (id) => {
    let called = false;
    await expect(
      uninstallPlugin(id, cli, async () => {
        called = true;
      }),
    ).rejects.toThrow(/Некорректный/);
    expect(called).toBe(false);
  });

  it('вызывает claude plugin uninstall <id> --scope user', async () => {
    const calls: [string, string[]][] = [];
    await uninstallPlugin('superpowers@superpowers-marketplace', cli, async (file, args) => {
      calls.push([file, args]);
    });
    expect(calls).toEqual([['/x/claude', ['plugin', 'uninstall', 'superpowers@superpowers-marketplace', '--scope', 'user']]]);
  });

  it('ошибка Claude Code пробрасывается с текстом', async () => {
    await expect(
      uninstallPlugin('sp@m', cli, async () => {
        throw new Error('Plugin "sp@m" is not installed');
      }),
    ).rejects.toThrow(/not installed/);
  });

  it('isPluginId', () => {
    expect(isPluginId('beads@beads-marketplace')).toBe(true);
    expect(isPluginId('template-bridge@template-bridge-marketplace')).toBe(true);
    expect(isPluginId('x@y z')).toBe(false);
  });
});
