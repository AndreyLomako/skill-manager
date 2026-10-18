import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VsCodeWindows {
  open: string[];
  active: string | null;
  error?: string;
}

interface RawWindow {
  folder?: unknown;
  workspace?: { configPath?: unknown };
}

export function normalizeWinPath(p: string): string {
  const n = path.win32.normalize(p);
  return /^[a-z]:/.test(n) ? n[0].toUpperCase() + n.slice(1) : n;
}

// Пути из ~/.claude.json и Codex бывают с прямыми слэшами и маленькой буквой диска.
export function normalizeProjectPath(p: string): string {
  const n = normalizeWinPath(
    p
      .replace(/\//g, '\\')
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/, ''),
  );
  return /^[A-Za-z]:\\$/.test(n) ? n : n.replace(/\\+$/, '');
}

export function fileUriToPath(uri: string): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return null;
  try {
    return normalizeProjectPath(fileURLToPath(uri, { windows: true }));
  } catch {
    return null;
  }
}

// .code-workspace — это JSONC: убираем строки-комментарии и висячие запятые.
function stripJsonc(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
}

async function workspaceFolders(configUri: string): Promise<string[]> {
  const file = fileUriToPath(configUri);
  if (!file) return [];
  try {
    const json = JSON.parse(stripJsonc(await readFile(file, 'utf8')));
    const dir = path.win32.dirname(file);
    const folders: Array<{ path?: unknown; uri?: unknown }> = Array.isArray(json.folders) ? json.folders : [];
    return folders
      .map((f) =>
        typeof f.path === 'string'
          ? normalizeWinPath(path.win32.resolve(dir, f.path))
          : typeof f.uri === 'string'
            ? fileUriToPath(f.uri)
            : null,
      )
      .filter((p): p is string => p !== null);
  } catch {
    return [];
  }
}

async function windowFolders(w: RawWindow): Promise<string[]> {
  if (typeof w.folder === 'string') {
    const p = fileUriToPath(w.folder);
    return p ? [p] : [];
  }
  if (w.workspace && typeof w.workspace.configPath === 'string') {
    return workspaceFolders(w.workspace.configPath);
  }
  return [];
}

export async function readOpenWindows(storagePath: string): Promise<VsCodeWindows> {
  let state: { openedWindows?: unknown; lastActiveWindow?: unknown };
  try {
    state = JSON.parse(await readFile(storagePath, 'utf8'))?.windowsState ?? {};
  } catch {
    return { open: [], active: null, error: `Не удалось прочитать список окон VS Code (${storagePath})` };
  }
  const windows = Array.isArray(state.openedWindows) ? (state.openedWindows as RawWindow[]) : [];
  const last = (state.lastActiveWindow ?? null) as RawWindow | null;
  const seen = new Set<string>();
  const open: string[] = [];
  for (const w of last ? [...windows, last] : windows) {
    for (const p of await windowFolders(w)) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        open.push(p);
      }
    }
  }
  const active = last ? ((await windowFolders(last))[0] ?? null) : null;
  return { open, active };
}

// storage.json хранит окна и после закрытия VS Code (для восстановления сессии),
// поэтому «открыто» имеет смысл, только если процесс Code.exe запущен.
export function isVsCodeRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq Code.exe', '/NH'],
      { windowsHide: true },
      (err, stdout) => resolve(!err && /Code\.exe/i.test(String(stdout))),
    );
  });
}
