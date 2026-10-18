import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSignal } from './types';
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
  const db = new DatabaseSync(file, { readOnly: true });
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
  running: () => Promise<boolean> = isCodexRunning,
  limit = 20,
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
  const isRunning = await running();
  return rows.map((r, i) => ({
    path: normalizeProjectPath(r.cwd),
    source: 'codex' as const,
    open: isRunning && i === 0,
    at: r.at,
  }));
}

export function isCodexRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) =>
      resolve(!err && /^"codex\.exe"/im.test(String(stdout))),
    );
  });
}
