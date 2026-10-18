import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppPaths } from './paths';
import type { Project } from './types';
import { isVsCodeRunning, readOpenWindows, type VsCodeWindows } from './vscode-windows';

export interface Settings {
  recent: string[];
  manual: string[];
}

export interface ProjectsResult {
  projects: Project[];
  error?: string;
}

const MAX_RECENT = 20;
const SETTINGS_FILE = 'settings.json';
const key = (p: string) => p.toLowerCase();

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function loadSettings(userDir: string): Promise<Settings> {
  try {
    const json = JSON.parse(await readFile(path.join(userDir, SETTINGS_FILE), 'utf8'));
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { recent: list(json.recent), manual: list(json.manual) };
  } catch {
    return { recent: [], manual: [] };
  }
}

export async function saveSettings(userDir: string, s: Settings): Promise<void> {
  await mkdir(userDir, { recursive: true });
  await writeFile(path.join(userDir, SETTINGS_FILE), JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export function rememberOpen(s: Settings, open: string[]): Settings {
  return { ...s, recent: uniq([...open, ...s.recent]).slice(0, MAX_RECENT) };
}

export function mergeProjects(win: VsCodeWindows, s: Settings): Project[] {
  const activeKey = win.active ? key(win.active) : null;
  const openKeys = new Set(win.open.map(key));
  const openSorted = [...win.open].sort(
    (a, b) => Number(key(b) === activeKey) - Number(key(a) === activeKey),
  );
  return uniq([...openSorted, ...s.recent, ...s.manual]).map((p) => ({
    path: p,
    name: path.win32.basename(p) || p,
    open: openKeys.has(key(p)),
    active: key(p) === activeKey,
  }));
}

export async function listProjects(
  paths: AppPaths,
  running: () => Promise<boolean> = isVsCodeRunning,
): Promise<ProjectsResult> {
  const raw = await readOpenWindows(paths.vscodeStorage);
  const win: VsCodeWindows = (await running()) ? raw : { open: [], active: null, error: raw.error };
  const settings = await loadSettings(paths.userDir);
  const next = rememberOpen(settings, win.open);
  if (next.recent.join('|') !== settings.recent.join('|')) await saveSettings(paths.userDir, next);
  return { projects: mergeProjects(win, next), error: win.error };
}

export async function addManualProject(paths: AppPaths, projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath.trim());
  const st = await stat(resolved).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`Папка не найдена: ${resolved}`);
  const s = await loadSettings(paths.userDir);
  await saveSettings(paths.userDir, { ...s, manual: uniq([...s.manual, resolved]) });
  return resolved;
}

export async function isKnownProject(
  paths: AppPaths,
  projectPath: string,
  running?: () => Promise<boolean>,
): Promise<boolean> {
  const { projects } = await listProjects(paths, running);
  const target = key(path.resolve(projectPath));
  return projects.some((p) => key(p.path) === target);
}
