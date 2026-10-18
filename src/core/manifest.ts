import type { CategoryDef, Manifest, SkillDef, SourceDef } from './types';

export class ManifestError extends Error {}

const ID = /^[a-z0-9][a-z0-9._-]*$/i;

type Raw = Record<string, unknown>;

export function emptyManifest(): Manifest {
  return { version: 1, categories: [], sources: [], skills: [] };
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

  const categories: CategoryDef[] = arr('categories').map((c, i) => ({
    id: id(c.id, `categories[${i}]`),
    title: str(c.title, `categories[${i}].title`),
    order: typeof c.order === 'number' ? c.order : undefined,
  }));

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

  const seen = new Set<string>();
  const skills: SkillDef[] = arr('skills').map((k, i) => {
    const where = `skills[${i}]`;
    const skillId = id(k.id, where);
    if (seen.has(skillId)) fail(`id "${skillId}" повторяется`);
    seen.add(skillId);
    const source = str(k.source, `${where}.source`);
    if (!sourceIds.has(source)) fail(`${where}.source "${source}" не найден в sources`);
    return {
      id: skillId,
      source,
      path: typeof k.path === 'string' ? k.path : '',
      category: str(k.category, `${where}.category`),
      title: optStr(k.title, `${where}.title`),
      description: optStr(k.description, `${where}.description`),
    };
  });

  return { version: 1, categories, sources, skills };
}
