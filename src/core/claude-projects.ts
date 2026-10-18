import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathApi } from './platform';
import type { ProjectSignal } from './types';
import { normalizeProjectPath } from './vscode-windows';

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: процесс есть, но сигнал слать нельзя — значит жив.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readClaudeSessions(
  home: string,
  alive: (pid: number) => boolean = pidAlive,
  platform: NodeJS.Platform = process.platform,
): Promise<ProjectSignal[]> {
  const dir = path.join(home, '.claude', 'sessions');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: ProjectSignal[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      const j = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
      if (typeof j?.pid !== 'number' || typeof j?.cwd !== 'string' || !j.cwd) continue;
      if (!alive(j.pid)) continue;
      out.push({
        path: normalizeProjectPath(j.cwd, platform),
        source: 'claude',
        open: true,
        at: typeof j.startedAt === 'number' ? j.startedAt : 0,
      });
    } catch {
      // битый файл сессии пропускаем
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export async function readClaudeRecent(home: string, platform: NodeJS.Platform = process.platform): Promise<ProjectSignal[]> {
  try {
    const j = JSON.parse(await readFile(path.join(home, '.claude.json'), 'utf8'));
    const projects = j?.projects && typeof j.projects === 'object' ? Object.keys(j.projects) : [];
    return projects
      .filter((p) => p.trim())
      .map((p) => normalizeProjectPath(p, platform))
      .filter((p) => pathApi(platform).isAbsolute(p))
      .map((p) => ({ path: p, source: 'claude' as const, open: false, at: 0 }));
  } catch {
    return [];
  }
}
