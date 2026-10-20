import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { pathKey, type Platform } from './platform';
import { getInstalled } from './installer';
import { isReservedSkillName, skillRoots, skillsRoot } from './skill-targets';
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
    if (info) out.push({ name, agent, kind, dir, root: parent, ...info, ...extra });
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

type PluginRecords = Array<{ installPath?: unknown; scope?: unknown }>;

/**
 * Плагины Claude Code, установленные для пользователя (scope user или без scope — старый формат)
 * и включённые в ~/.claude/settings.json: id «имя@магазин» → записи установки.
 * Установки уровня проекта (scope project/local) в глобальный список не входят.
 */
async function userPlugins(home: string): Promise<[string, PluginRecords][]> {
  const installed = await readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  const settings = await readJson(path.join(home, '.claude', 'settings.json'));
  const enabled: Record<string, unknown> = settings?.enabledPlugins ?? {};
  const plugins: Record<string, unknown> = installed?.plugins ?? {};
  const out: [string, PluginRecords][] = [];
  for (const [key, records] of Object.entries(plugins)) {
    if (enabled[key] !== true || !Array.isArray(records)) continue;
    const user = (records as PluginRecords).filter((r) => r?.scope === undefined || r.scope === 'user');
    if (user.length > 0) out.push([key, user]);
  }
  return out;
}

export async function enabledPluginIds(home: string): Promise<string[]> {
  return (await userPlugins(home)).map(([key]) => key);
}

async function pluginSkills(home: string, platform: Platform): Promise<InstalledSkill[]> {
  const out: InstalledSkill[] = [];
  const seen = new Set<string>();
  for (const [key, records] of await userPlugins(home)) {
    const plugin = key.split('@')[0];
    for (const r of records) {
      if (typeof r?.installPath !== 'string') continue;
      for (const s of await collect(path.join(r.installPath, 'skills'), 'claude', 'plugin', { plugin, pluginId: key })) {
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
    for (const r of skillRoots(scope, agent, home)) {
      // Статус — по своему корню: одинаковое имя в двух папках — две разные копии.
      const state = await getInstalled(r, catalog, agent);
      for (const s of await collect(r, agent, 'managed', {}, isReservedSkillName)) {
        out.push({ ...s, status: state[s.name] });
      }
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
