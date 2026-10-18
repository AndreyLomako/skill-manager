import { readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from './json-file';
import type { AppPaths } from './paths';
import { pidAlive as defaultPidAlive, readClaudeRecent, readClaudeSessions } from './claude-projects';
import { isCodexRunning, readCodexProjects } from './codex-projects';
import { pathApi, pathKey } from './platform';
import type { Project, ProjectSignal, ProjectSource } from './types';
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
function uniq(list: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = pathKey(p, platform);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function loadSettings(userDir: string): Promise<Settings> {
  const file = path.join(userDir, SETTINGS_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { recent: [], manual: [] };
    throw e;
  }
  if (!text.trim()) return { recent: [], manual: [] };
  let json: { recent?: unknown; manual?: unknown };
  try {
    json = JSON.parse(text);
    if (json === null || typeof json !== 'object') throw new SyntaxError('not an object');
  } catch {
    await rename(file, path.join(userDir, `${SETTINGS_FILE}.corrupt-${Date.now()}`));
    return { recent: [], manual: [] };
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { recent: list(json.recent), manual: list(json.manual) };
}

export async function saveSettings(userDir: string, s: Settings): Promise<void> {
  await writeJsonAtomic(path.join(userDir, SETTINGS_FILE), s);
}

// Уже записанное написание пути сохраняется: иначе смена регистра в сигналах переписывала бы recent.
export function rememberOpen(s: Settings, open: string[], platform: NodeJS.Platform = process.platform): Settings {
  const key = (p: string) => pathKey(p, platform);
  const stored = new Map(s.recent.map((p) => [key(p), p]));
  return { ...s, recent: uniq([...open.map((p) => stored.get(key(p)) ?? p), ...s.recent], platform).slice(0, MAX_RECENT) };
}

export interface ProjectDeps {
  vscodeRunning?: () => Promise<boolean>;
  pidAlive?: (pid: number) => boolean;
  codexRunning?: () => Promise<boolean>;
  platform?: NodeJS.Platform;
}

const SOURCE_ORDER: ProjectSource[] = ['vscode', 'claude', 'codex', 'manual'];

// Проверки процессов (tasklist) медленные, а UI опрашивает список каждые 2 с.
export function memoizeFor<T>(ms: number, fn: () => Promise<T>): () => Promise<T> {
  let cached: { at: number; value: Promise<T> } | null = null;
  return () => {
    const now = Date.now();
    if (!cached || now - cached.at >= ms) cached = { at: now, value: fn() };
    return cached.value;
  };
}

const PROCESS_CHECK_TTL_MS = 5000;
const defaultVsCodeRunning = new Map<NodeJS.Platform, () => Promise<boolean>>();
const defaultCodexRunning = new Map<NodeJS.Platform, () => Promise<boolean>>();

function memoizedFor(
  cache: Map<NodeJS.Platform, () => Promise<boolean>>,
  platform: NodeJS.Platform,
  check: (platform: NodeJS.Platform) => Promise<boolean>,
): () => Promise<boolean> {
  let fn = cache.get(platform);
  if (!fn) {
    fn = memoizeFor(PROCESS_CHECK_TTL_MS, () => check(platform));
    cache.set(platform, fn);
  }
  return fn;
}

export function mergeSignals(
  signals: ProjectSignal[],
  activePath: string | null,
  s: Settings,
  platform: NodeJS.Platform = process.platform,
): Project[] {
  const key = (p: string) => pathKey(p, platform);
  const activeKey = activePath ? key(activePath) : null;
  const vscodeOpen = signals.filter((x) => x.open && x.source === 'vscode');
  const otherOpen = signals.filter((x) => x.open && x.source !== 'vscode').sort((a, b) => b.at - a.at);
  const closed = signals.filter((x) => !x.open).sort((a, b) => b.at - a.at);
  const order = uniq([
    ...(activePath ? [activePath] : []),
    ...[...vscodeOpen, ...otherOpen, ...closed].map((x) => x.path),
    ...s.recent,
    ...s.manual,
  ], platform);
  const manualKeys = new Set(s.manual.map(key));
  // Показываемый путь не должен меняться от порядка/регистра сигналов: сначала написание из settings.
  const stored = new Map<string, string>();
  for (const p of [...s.recent, ...s.manual]) if (!stored.has(key(p))) stored.set(key(p), p);
  return order.map((p) => {
    const mine = signals.filter((x) => key(x.path) === key(p));
    const found = new Set<ProjectSource>(mine.map((x) => x.source));
    if (manualKeys.has(key(p))) found.add('manual');
    const shown = stored.get(key(p)) ?? mine[0]?.path ?? p;
    return {
      path: shown,
      name: pathApi(platform).basename(shown) || shown,
      open: mine.some((x) => x.open),
      active: key(p) === activeKey,
      sources: SOURCE_ORDER.filter((src) => found.has(src)),
    };
  });
}

export async function listProjects(paths: AppPaths, deps: ProjectDeps = {}): Promise<ProjectsResult> {
  const platform = deps.platform ?? process.platform;
  const raw = await readOpenWindows(paths.vscodeStorage, platform);
  const vscodeUp = await (deps.vscodeRunning ?? memoizedFor(defaultVsCodeRunning, platform, isVsCodeRunning))();
  const win: VsCodeWindows = vscodeUp ? raw : { open: [], active: null, error: raw.error };
  const [sessions, claudeRecent, codex] = await Promise.all([
    readClaudeSessions(paths.home, deps.pidAlive ?? defaultPidAlive, platform),
    readClaudeRecent(paths.home, platform),
    readCodexProjects(
      paths.home,
      deps.codexRunning ?? memoizedFor(defaultCodexRunning, platform, isCodexRunning),
      20,
      platform,
    ),
  ]);
  const signals: ProjectSignal[] = [
    ...win.open.map((p) => ({ path: p, source: 'vscode' as const, open: true, at: 0 })),
    ...sessions,
    ...claudeRecent,
    ...codex,
  ];
  const activePath = win.active ?? sessions[0]?.path ?? null;
  const settings = await loadSettings(paths.userDir);
  const next = rememberOpen(settings, signals.filter((x) => x.open).map((x) => x.path), platform);
  if (next.recent.join('|') !== settings.recent.join('|')) await saveSettings(paths.userDir, next);
  return { projects: mergeSignals(signals, activePath, next, platform), error: win.error };
}

export async function addManualProject(
  paths: AppPaths,
  projectPath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  const resolved = path.resolve(projectPath.trim());
  const st = await stat(resolved).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`Папка не найдена: ${resolved}`);
  const s = await loadSettings(paths.userDir);
  await saveSettings(paths.userDir, { ...s, manual: uniq([...s.manual, resolved], platform) });
  return resolved;
}

export async function isKnownProject(paths: AppPaths, projectPath: string, deps?: ProjectDeps): Promise<boolean> {
  const platform = deps?.platform ?? process.platform;
  const { projects } = await listProjects(paths, deps);
  const target = pathKey(path.resolve(projectPath), platform);
  return projects.some((p) => pathKey(p.path, platform) === target);
}
