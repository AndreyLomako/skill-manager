import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { pathKey, type Platform } from './platform';
import { getInstalled } from './installer';
import { isReservedSkillName, skillsRoot } from './skill-targets';
import type { AgentId, CatalogSkill, InstalledKind, InstalledSkill, Scope } from './types';

const KIND_ORDER: InstalledKind[] = ['managed', 'synced', 'plugin', 'system'];
const exists = (p: string) => access(p).then(() => true, () => false);

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function describeSkill(dir: string, name: string): Promise<{ title: string; description: string } | null> {
  try {
    const fm = readFrontmatter(await readFile(path.join(dir, 'SKILL.md'), 'utf8'));
    return { title: fm.name || name, description: fm.description ?? '' };
  } catch {
    return null;
  }
}

async function collect(
  parent: string,
  agent: AgentId,
  kind: InstalledKind,
  extra: Partial<InstalledSkill> = {},
  skip: (name: string) => boolean = () => false,
): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const name of await subdirs(parent)) {
    if (skip(name)) continue;
    const dir = path.join(parent, name);
    const info = await describeSkill(dir, name);
    if (info) out.push({ name, agent, kind, dir, ...info, ...extra });
  }
  return out;
}

async function readJson(file: string): Promise<any> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function pluginSkills(home: string, platform: Platform): Promise<InstalledSkill[]> {
  const installed = await readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  const settings = await readJson(path.join(home, '.claude', 'settings.json'));
  const enabled: Record<string, unknown> = settings?.enabledPlugins ?? {};
  const plugins: Record<string, Array<{ installPath?: unknown }>> = installed?.plugins ?? {};
  const out: InstalledSkill[] = [];
  const seen = new Set<string>();
  for (const [key, records] of Object.entries(plugins)) {
    if (enabled[key] !== true || !Array.isArray(records)) continue;
    const plugin = key.split('@')[0];
    for (const r of records) {
      if (typeof r?.installPath !== 'string') continue;
      for (const s of await collect(path.join(r.installPath, 'skills'), 'claude', 'plugin', { plugin })) {
        const key = pathKey(s.dir, platform);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
    }
  }
  return out;
}

export async function listInstalled(
  scope: Scope,
  agents: AgentId[],
  home: string,
  catalog: CatalogSkill[],
  platform: Platform = process.platform,
): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  for (const agent of agents) {
    const root = skillsRoot(scope, agent, home);
    const state = await getInstalled(root, catalog);
    for (const s of await collect(root, agent, 'managed', {}, isReservedSkillName)) {
      out.push({ ...s, status: state[s.name] });
    }
    if (scope.kind !== 'global') continue;
    if (agent === 'claude') {
      for (const bucket of await subdirs(path.join(root, 'synced'))) {
        out.push(...(await collect(path.join(root, 'synced', bucket), 'claude', 'synced')));
      }
      out.push(...(await pluginSkills(home, platform)));
    } else {
      for (const sys of [path.join(home, '.codex', 'skills', '.system'), path.join(root, '.system')]) {
        if (await exists(sys)) out.push(...(await collect(sys, 'codex', 'system')));
      }
    }
  }
  return out.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, 'ru'),
  );
}
