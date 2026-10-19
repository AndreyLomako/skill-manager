import type { AgentId, CategoryDef, Manifest, PackDef, SkillCommand, SkillDef, SourceDef } from './types';

export class ManifestError extends Error {}

const ID = /^[a-z0-9][a-z0-9._-]*$/i;
const AGENT_IDS: readonly AgentId[] = ['claude', 'codex'];
const MAX_COMMANDS = 8;

type Raw = Record<string, unknown>;

export function emptyManifest(): Manifest {
  return { version: 1, categories: [], sources: [], skills: [], packs: [] };
}

export function parseManifest(raw: string, label: string): Manifest {
  const fail = (msg: string): never => {
    throw new ManifestError(`${label}: ${msg}`);
  };

  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (e) {
    return fail(`некорректный JSON (${(e as Error).message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('ожидается объект');
  const root = data as Raw;
  if (root.version !== 1) fail('поддерживается только "version": 1');

  const arr = (name: string): Raw[] => {
    const v = root[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) return fail(`"${name}" должен быть массивом`);
    return v.map((x) => (x && typeof x === 'object' ? (x as Raw) : {}));
  };
  const id = (v: unknown, where: string): string =>
    typeof v === 'string' && ID.test(v) ? v : fail(`${where}.id некорректен`);
  const str = (v: unknown, where: string): string =>
    typeof v === 'string' && v.trim() ? v : fail(`${where} обязателен`);
  const optStr = (v: unknown, where: string): string | undefined =>
    v === undefined ? undefined : typeof v === 'string' ? v : fail(`${where} должен быть строкой`);
  const optRef = (v: unknown, where: string): string | undefined =>
    v === undefined ? undefined : typeof v === 'string' && ID.test(v) ? v : fail(`${where} некорректен`);

  const categories: CategoryDef[] = arr('categories').map((c, i) => {
    const parent = optRef(c.parent, `categories[${i}].parent`);
    return {
      id: id(c.id, `categories[${i}]`),
      title: str(c.title, `categories[${i}].title`),
      order: typeof c.order === 'number' ? c.order : undefined,
      ...(parent ? { parent } : {}),
    };
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  for (const c of categories) {
    if (!c.parent) continue;
    const parent = categoryById.get(c.parent);
    if (!parent) fail(`categories: parent "${c.parent}" у «${c.title}» не найден`);
    else if (parent.parent) fail(`categories: вложенность категорий — один уровень («${c.title}» → «${parent.title}»)`);
  }

  const sources: SourceDef[] = arr('sources').map((s, i): SourceDef => {
    const where = `sources[${i}]`;
    if (s.type === 'local') return { id: id(s.id, where), type: 'local', path: str(s.path, `${where}.path`) };
    if (s.type === 'git') {
      const ref = optStr(s.ref, `${where}.ref`);
      return { id: id(s.id, where), type: 'git', url: str(s.url, `${where}.url`), ...(ref ? { ref } : {}) };
    }
    return fail(`${where}.type должен быть "local" или "git"`);
  });
  const sourceIds = new Set(sources.map((s) => s.id));

  const parsePaths = (v: unknown, where: string): Partial<Record<AgentId, string>> | undefined => {
    if (v === undefined) return undefined;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(`${where} должен быть объектом`);
    const out: Partial<Record<AgentId, string>> = {};
    for (const [agent, p] of Object.entries(v as Raw)) {
      if (!AGENT_IDS.includes(agent as AgentId)) fail(`${where}: неизвестный агент "${agent}"`);
      out[agent as AgentId] = str(p, `${where}.${agent}`);
    }
    if (Object.keys(out).length === 0) fail(`${where} пуст`);
    return out;
  };

  const parseCommands = (v: unknown, where: string): SkillCommand[] | undefined => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) return fail(`${where} должен быть массивом`);
    if (v.length > MAX_COMMANDS) fail(`${where}: не больше ${MAX_COMMANDS} команд`);
    return v.map((c, j) => {
      const x = c && typeof c === 'object' ? (c as Raw) : {};
      return { cmd: str(x.cmd, `${where}[${j}].cmd`), hint: str(x.hint, `${where}[${j}].hint`) };
    });
  };

  const seen = new Set<string>();
  const skills: SkillDef[] = arr('skills').map((k, i) => {
    const where = `skills[${i}]`;
    const skillId = id(k.id, where);
    if (seen.has(skillId)) fail(`id "${skillId}" повторяется`);
    seen.add(skillId);
    const source = str(k.source, `${where}.source`);
    if (!sourceIds.has(source)) fail(`${where}.source "${source}" не найден в sources`);
    const pathValue = typeof k.path === 'string' ? k.path : '';
    const paths = parsePaths(k.paths, `${where}.paths`);
    if (paths && pathValue) fail(`${where}: укажите path или paths, не оба`);
    const homepage = optStr(k.homepage, `${where}.homepage`);
    if (homepage !== undefined && !homepage.startsWith('https://')) fail(`${where}.homepage должен начинаться с https://`);
    const more = k.commandsMore;
    if (more !== undefined && !(typeof more === 'number' && Number.isInteger(more) && more >= 0)) {
      fail(`${where}.commandsMore должен быть целым числом ≥ 0`);
    }
    const skill: SkillDef = {
      id: skillId,
      source,
      path: pathValue,
      category: str(k.category, `${where}.category`),
      title: optStr(k.title, `${where}.title`),
      description: optStr(k.description, `${where}.description`),
    };
    const summary = optStr(k.summary, `${where}.summary`);
    const commands = parseCommands(k.commands, `${where}.commands`);
    if (paths) skill.paths = paths;
    if (summary !== undefined) skill.summary = summary;
    if (commands) skill.commands = commands;
    if (more !== undefined) skill.commandsMore = more as number;
    if (homepage !== undefined) skill.homepage = homepage;
    return skill;
  });
  const skillById = new Map(skills.map((s) => [s.id, s]));

  const inPack = new Map<string, string>();
  const packIds = new Set<string>();
  const packs: PackDef[] = arr('packs').map((p, i) => {
    const where = `packs[${i}]`;
    const packId = id(p.id, where);
    if (packIds.has(packId) || skillById.has(packId)) fail(`id "${packId}" повторяется`);
    packIds.add(packId);
    const category = str(p.category, `${where}.category`);
    if (!Array.isArray(p.skills) || p.skills.length === 0) return fail(`${where}.skills пуст`);
    const members = p.skills.map((s, j) => {
      const sid = typeof s === 'string' ? s : fail(`${where}.skills[${j}] должен быть строкой`);
      const skill = skillById.get(sid);
      if (!skill) fail(`${where}: скилл "${sid}" не найден в skills`);
      else if (skill.category !== category) fail(`${where}: скилл "${sid}" из другой категории ("${skill.category}")`);
      const other = inPack.get(sid);
      if (other) fail(`${where}: скилл "${sid}" уже в паке "${other}"`);
      inPack.set(sid, packId);
      return sid;
    });
    const summary = optStr(p.summary, `${where}.summary`);
    return {
      id: packId,
      title: str(p.title, `${where}.title`),
      category,
      ...(summary !== undefined ? { summary } : {}),
      skills: members,
    };
  });

  return { version: 1, categories, sources, skills, packs };
}
