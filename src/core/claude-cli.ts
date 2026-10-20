import { execFile } from 'node:child_process';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Platform } from './platform';

/** Где найден Claude Code: отдельный клиент (CLI) или расширение редактора (VS Code, Cursor, Windsurf). */
export interface ClaudeCli {
  path: string;
  source: 'cli' | 'vscode';
}

const exists = (p: string) => access(p).then(() => true, () => false);

// Папки расширений редакторов на базе VS Code: у всех одинаковое устройство.
const EDITOR_DIRS = ['.vscode', '.vscode-insiders', '.cursor', '.windsurf'];
const EXTENSION = /^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/;

/** Абсолютные папки из PATH (без кавычек; относительные пропускаются). */
function pathDirs(env: Record<string, string | undefined>, platform: Platform): string[] {
  const win = platform === 'win32';
  const key = win ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') : 'PATH';
  const raw = key ? (env[key] ?? '') : '';
  return raw
    .split(win ? ';' : ':')
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    .filter((d) => d && (win ? path.win32.isAbsolute(d) : path.posix.isAbsolute(d)));
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
 * Ищет исполняемый Claude Code: клиент (PATH, нативный установщик ~/.local/bin; на macOS/Linux ещё
 * Homebrew, /usr/local/bin, ~/.claude/local — у приложений из Finder урезанный PATH) или бинарник
 * расширения VS Code / Cursor / Windsurf (самая новая версия). На Windows настоящий .exe важнее
 * npm-обёртки claude.cmd: её можно запустить только через cmd.exe.
 */
export async function findClaudeCli(opts: {
  env: Record<string, string | undefined>;
  home: string;
  platform: Platform;
}): Promise<ClaudeCli | null> {
  const win = opts.platform === 'win32';
  const exe = win ? 'claude.exe' : 'claude';
  const clientDirs = [
    ...pathDirs(opts.env, opts.platform),
    path.join(opts.home, '.local', 'bin'),
    ...(win ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path.join(opts.home, '.claude', 'local')]),
  ];
  for (const dir of clientDirs) {
    const file = path.join(dir, exe);
    if (await exists(file)) return { path: file, source: 'cli' };
  }
  for (const bin of await extensionBinaries(opts.home, exe)) {
    if (await exists(bin)) return { path: bin, source: 'vscode' };
  }
  if (win) {
    for (const dir of clientDirs) {
      const file = path.join(dir, 'claude.cmd');
      if (await exists(file)) return { path: file, source: 'cli' };
    }
  }
  return null;
}

// «имя@магазин»: только буквы, цифры, «.», «_», «-», без ведущего дефиса.
const PLUGIN_ID = /^[A-Za-z0-9][\w.-]*@[A-Za-z0-9][\w.-]*$/;

export function isPluginId(id: string): boolean {
  return PLUGIN_ID.test(id);
}

export type CliRunner = (file: string, args: string[]) => Promise<void>;

const TIMEOUT_MS = 60_000;

/** Текст ошибки: вывод программы, если он читаемый (cmd.exe пишет в OEM-кодировке — тогда общий текст). */
function cliErrorText(err: Error & { killed?: boolean; code?: unknown }, output: string): string {
  if (err.killed) return `Claude Code не ответил за ${TIMEOUT_MS / 1000} с`;
  const text = output.trim();
  if (text && !text.includes('�')) return text.length > 400 ? `…${text.slice(-400)}` : text;
  return `Claude Code завершился с ошибкой${typeof err.code === 'number' ? ` (код ${err.code})` : ''}`;
}

export const runCli: CliRunner = (file, args) =>
  new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    // Обёртки npm (#!/usr/bin/env node) ищут node рядом с собой.
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    env[pathKey] = [path.dirname(file), env[pathKey]].filter(Boolean).join(path.delimiter);
    const done = (err: (Error & { killed?: boolean }) | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(cliErrorText(err, `${stderr}\n${stdout}`)));
      else resolve();
    };
    const opts = { windowsHide: true, timeout: TIMEOUT_MS, env };
    if (/\.(cmd|bat)$/i.test(file)) {
      // .cmd запускается только через cmd.exe; аргументы — проверенные id и флаги без спецсимволов.
      execFile(`"${file}" ${args.join(' ')}`, { ...opts, shell: true }, done);
    } else {
      execFile(file, args, opts, done);
    }
  });

/**
 * Удаляет плагин Claude Code целиком (скиллы, команды, агенты, хуки) официальной командой.
 * Данные плагина (~/.claude/plugins/data/<id>) сохраняются, чтобы /plugin install вернул всё как было.
 */
export async function uninstallPlugin(pluginId: string, cli: ClaudeCli, run: CliRunner = runCli): Promise<void> {
  if (!isPluginId(pluginId)) throw new Error(`Некорректный id плагина: ${pluginId}`);
  const args = ['plugin', 'uninstall', pluginId, '--scope', 'user'];
  try {
    await run(cli.path, [...args, '--keep-data']);
  } catch (e) {
    // Старый Claude Code без --keep-data.
    if (!/unknown option.*keep-data/i.test((e as Error).message)) throw e;
    await run(cli.path, args);
  }
}

/** Команда для ручного удаления внутри Claude Code (VS Code или клиент). */
export const pluginUninstallCommand = (pluginId: string) => `/plugin uninstall ${pluginId}`;
