import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProjectSignal } from './types';
import { isProcessRunning, type RunFn } from './platform';
import { normalizeProjectPath } from './vscode-windows';

type Sqlite = typeof import('node:sqlite');

export async function findCodexStateDb(home: string): Promise<string | null> {
  const dir = path.join(home, '.codex');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  let best: { n: number; name: string } | null = null;
  for (const name of names) {
    const m = /^state_(\d+)\.sqlite$/.exec(name);
    if (m && (!best || Number(m[1]) > best.n)) best = { n: Number(m[1]), name };
  }
  return best ? path.join(dir, best.name) : null;
}

function readThreads(file: string, limit: number): Array<{ cwd: string; at: number }> {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as Sqlite;
  // With no -wal/-shm present, a readOnly open of a WAL db still creates them; immutable=1 does not.
  const sideFiles = existsSync(`${file}-wal`) || existsSync(`${file}-shm`);
  const db = sideFiles
    ? new DatabaseSync(file, { readOnly: true })
    : new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true });
  try {
    const cols = new Set(
      (db.prepare('pragma table_info(threads)').all() as Array<{ name: string }>).map((c) => c.name),
    );
    if (!cols.has('cwd')) return [];
    const timeCol = ['recency_at_ms', 'updated_at_ms', 'updated_at'].find((c) => cols.has(c));
    const timeExpr = timeCol ? `max(${timeCol})` : '0';
    const archived = cols.has('archived') ? 'and (archived is null or archived = 0)' : '';
    const rows = db
      .prepare(
        `select cwd, ${timeExpr} as at from threads where cwd is not null and cwd <> '' ${archived} group by cwd order by at desc limit ?`,
      )
      .all(limit) as Array<{ cwd: string; at: number | null }>;
    const scale = timeCol === 'updated_at' ? 1000 : 1;
    return rows.map((r) => ({ cwd: r.cwd, at: Number(r.at ?? 0) * scale }));
  } finally {
    db.close();
  }
}

export async function readCodexProjects(
  home: string,
  running?: () => Promise<boolean>,
  limit = 20,
  platform: NodeJS.Platform = process.platform,
): Promise<ProjectSignal[]> {
  const file = await findCodexStateDb(home);
  if (!file) return [];
  let rows: Array<{ cwd: string; at: number }>;
  try {
    rows = readThreads(file, limit);
  } catch {
    return [];
  }
  if (rows.length === 0) return [];
  const isRunning = await (running ?? (() => isCodexRunning(platform)))();
  return rows.map((r, i) => ({
    path: normalizeProjectPath(r.cwd, platform),
    source: 'codex' as const,
    open: isRunning && i === 0,
    at: r.at,
  }));
}

export function isCodexRunning(platform: NodeJS.Platform = process.platform, run?: RunFn): Promise<boolean> {
  return isProcessRunning({
      win32: 'codex.exe',
      darwin: { pgrep: ['-ix', 'codex'] },
      linux: { pgrep: ['-ix', 'codex'] },
    }, platform, run);
}
