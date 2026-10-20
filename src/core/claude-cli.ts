import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Platform } from './platform';

/** Где найден Claude Code: отдельный клиент (CLI) или расширение редактора (VS Code, Cursor…). */
export interface ClaudeCli {
  path: string;
  source: 'cli' | 'vscode';
}

const exists = (p: string) => access(p).then(() => true, () => false);

// Папки расширений редакторов на базе VS Code: у всех одинаковое устройство.
const EDITOR_DIRS = ['.vscode', '.vscode-insiders', '.cursor', '.windsurf'];
const EXTENSION = /^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/;

function envPath(env: Record<string, string | undefined>, platform: Platform): string {
  if (platform !== 'win32') return env.PATH ?? '';
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  return key ? (env[key] ?? '') : '';
}

async function extensionBinaries(home: string, exe: string): Promise<string[]> {
  const found: { version: number[]; bin: string }[] = [];
  for (const editor of EDITOR_DIRS) {
    const dir = path.join(home, editor, 'extensions');
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const m = EXTENSION.exec(name);
      if (m) found.push({ version: m.slice(1, 4).map(Number), bin: path.join(dir, name, 'resources', 'native-binary', exe) });
    }
  }
  found.sort((a, b) => b.version[0] - a.version[0] || b.version[1] - a.version[1] || b.version[2] - a.version[2]);
  return found.map((f) => f.bin);
}

/**
 * Ищет исполняемый Claude Code: сначала клиент (PATH, нативный установщик ~/.local/bin),
 * затем бинарник, который идёт с расширением VS Code / Cursor / Windsurf (самая новая версия).
 */
export async function findClaudeCli(opts: {
  env: Record<string, string | undefined>;
  home: string;
  platform: Platform;
}): Promise<ClaudeCli | null> {
  const win = opts.platform === 'win32';
  const names = win ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const sep = win ? ';' : ':';
  const dirs = [
    ...envPath(opts.env, opts.platform).split(sep).filter(Boolean),
    path.join(opts.home, '.local', 'bin'),
  ];
  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (await exists(file)) return { path: file, source: 'cli' };
    }
  }
  for (const bin of await extensionBinaries(opts.home, names[0])) {
    if (await exists(bin)) return { path: bin, source: 'vscode' };
  }
  return null;
}

// «имя@магазин»: только буквы, цифры, «.», «_», «-», без ведущего дефиса.
const PLUGIN_ID = /^[A-Za-z0-9][\w.-]*@[A-Za-z0-9][\w.-]*$/;

export function isPluginId(id: string): boolean {
  return PLUGIN_ID.test(id);
}

export type CliRunner = (file: string, args: string[]) => Promise<void>;

export const runCli: CliRunner = (file, args) =>
  new Promise((resolve, reject) => {
    // .cmd (npm) на Windows запускается только через shell; аргументы заранее проверены по PLUGIN_ID.
    const viaShell = /\.(cmd|bat)$/i.test(file);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    execFile(
      viaShell ? `"${file}"` : file,
      args,
      { windowsHide: true, timeout: 60_000, shell: viaShell, env },
      (err, stdout, stderr) => {
        const text = `${stderr}\n${stdout}`.trim();
        if (err) reject(new Error(text ? text.slice(0, 400) : err.message));
        else resolve();
      },
    );
  });

/** Удаляет плагин Claude Code целиком (скиллы, команды, агенты, хуки) — официальной командой. */
export async function uninstallPlugin(pluginId: string, cli: ClaudeCli, run: CliRunner = runCli): Promise<void> {
  if (!isPluginId(pluginId)) throw new Error(`Некорректный id плагина: ${pluginId}`);
  await run(cli.path, ['plugin', 'uninstall', pluginId, '--scope', 'user']);
}

/** Команда для ручного удаления внутри Claude Code (VS Code или клиент). */
export const pluginUninstallCommand = (pluginId: string) => `/plugin uninstall ${pluginId}`;
