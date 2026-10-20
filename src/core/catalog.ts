import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { emptyManifest, parseManifest } from './manifest';
import { BASE_MANIFEST, USER_MANIFEST, type AppPaths } from './paths';
import { ensureSource, normalizeRepoPath, NotClonedError, runGit, type GitRunner } from './sources';
import { AGENTS } from './skill-targets';
import type { AgentId, Catalog, CatalogPack, CatalogSkill, CategoryDef, Layer, Manifest, SkillDef, SourceDef } from './types';

export class CatalogError extends Error {}

const LAYER_LABEL: Record<Layer, string> = { base: 'базовый', user: 'мой' };

async function readManifestFile(file: string, label: string): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  return parseManifest(raw, label);
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function sourceLabel(src: SourceDef | undefined): string {
  if (!src) return '';
  return src.type === 'git' ? src.url.replace(/\.git$/, '') : `папка: ${src.path}`;
}

/** Пути скилла по агентам: paths, иначе общий path для всех агентов. */
function agentPaths(def: SkillDef): [AgentId, string][] {
  return AGENTS.flatMap((agent): [AgentId, string][] => {
    const p = def.paths ? def.paths[agent] : def.path;
    return p === undefined ? [] : [[agent, p]];
  });
}

/** Пути git-источника для частичного клона; undefined — нужен весь репозиторий (скилл в корне). */
export function sparsePaths(manifest: Manifest, sourceId: string): string[] | undefined {
  const all = manifest.skills.filter((d) => d.source === sourceId).flatMap((d) => agentPaths(d).map(([, p]) => p));
  return all.length > 0 && all.every((p) => normalizeRepoPath(p) !== '') ? all : undefined;
}

async function resolveLayer(
  layer: Layer,
  manifest: Manifest,
  manifestDir: string,
  cacheDir: string,
  update: boolean,
  clone: boolean,
  git: GitRunner,
  errors: string[],
): Promise<CatalogSkill[]> {
  const sourceDirs = new Map<string, string | null>();
  const pending = new Set<string>();
  for (const src of manifest.sources) {
    try {
      const onWarning = (msg: string) => {
        const text = `Источник «${src.id}» (${LAYER_LABEL[layer]}): не удалось обновить — ${msg}`;
        if (!errors.includes(text)) errors.push(text);
      };
      const sparse = src.type === 'git' ? sparsePaths(manifest, src.id) : undefined;
      sourceDirs.set(src.id, await ensureSource(src, { layer, manifestDir, cacheDir, update, onWarning, sparse, clone }, git));
    } catch (e) {
      sourceDirs.set(src.id, null);
      if (e instanceof NotClonedError) {
        pending.add(src.id);
        continue;
      }
      errors.push(`Источник «${src.id}» (${LAYER_LABEL[layer]}): ${(e as Error).message}`);
    }
  }

  const packOf = new Map<string, string>();
  for (const pack of manifest.packs) for (const id of pack.skills) packOf.set(id, pack.id);
  const sources = new Map(manifest.sources.map((s) => [s.id, s]));

  const skills: CatalogSkill[] = [];
  for (const def of manifest.skills) {
    const base: CatalogSkill = {
      id: def.id,
      category: def.category,
      layer,
      title: def.title ?? def.id,
      description: def.description ?? '',
      summary: def.summary ?? def.description ?? '',
      dirs: {},
      commands: def.commands ?? [],
      commandsMore: def.commandsMore ?? 0,
      sourceLabel: sourceLabel(sources.get(def.source)),
      ...(def.homepage ? { homepage: def.homepage } : {}),
      ...(packOf.has(def.id) ? { pack: packOf.get(def.id) } : {}),
    };
    const srcDir = sourceDirs.get(def.source) ?? null;
    if (!srcDir) {
      skills.push(pending.has(def.source) ? { ...base, pending: true, error: 'Загружается…' } : { ...base, error: 'Источник недоступен' });
      continue;
    }
    const dirs: Partial<Record<AgentId, string>> = {};
    let md: string | null = null;
    let outside = false;
    for (const [agent, rel] of agentPaths(def)) {
      const dir = path.resolve(srcDir, rel);
      if (!isInside(srcDir, dir)) {
        outside = true;
        break;
      }
      try {
        const text = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
        dirs[agent] = dir;
        md ??= text;
      } catch {
        // Нет копии для этого агента — ставится только туда, где копия есть.
      }
    }
    if (outside) {
      skills.push({ ...base, error: 'Путь скилла выходит за пределы источника' });
      continue;
    }
    if (md === null) {
      skills.push({ ...base, error: 'SKILL.md не найден' });
      continue;
    }
    const fm = readFrontmatter(md);
    const description = def.description ?? fm.description ?? '';
    skills.push({
      ...base,
      dirs,
      title: def.title ?? fm.name ?? def.id,
      description,
      summary: def.summary ?? description,
    });
  }
  return skills;
}

export function mergeCategories(
  base: CategoryDef[],
  user: CategoryDef[],
  skills: CatalogSkill[],
): CategoryDef[] {
  const map = new Map<string, CategoryDef>();
  for (const c of [...base, ...user]) map.set(c.id, { ...c });
  for (const s of skills) if (!map.has(s.category)) map.set(s.category, { id: s.category, title: s.category });
  return [...map.values()].sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.title.localeCompare(b.title, 'ru'),
  );
}

export async function loadCatalog(
  paths: AppPaths,
  opts: { update?: boolean; clone?: boolean } = {},
  git: GitRunner = runGit,
): Promise<Catalog> {
  const errors: string[] = [];
  const update = opts.update ?? false;
  const clone = opts.clone ?? true;

  const baseFile = path.join(paths.baseCatalogDir, BASE_MANIFEST);
  let base: Manifest | null;
  try {
    base = await readManifestFile(baseFile, 'Базовый каталог');
  } catch (e) {
    throw new CatalogError((e as Error).message);
  }
  if (!base) throw new CatalogError(`Базовый каталог не найден: ${baseFile}`);

  let user = emptyManifest();
  try {
    user = (await readManifestFile(path.join(paths.userDir, USER_MANIFEST), 'Мой каталог')) ?? user;
  } catch (e) {
    errors.push((e as Error).message);
  }

  const baseSkills = await resolveLayer('base', base, paths.baseCatalogDir, paths.cacheDir, update, clone, git, errors);
  const userSkills = await resolveLayer('user', user, paths.userDir, paths.cacheDir, update, clone, git, errors);

  const byId = new Map<string, CatalogSkill>();
  for (const s of [...baseSkills, ...userSkills]) byId.set(s.id, s);

  const packById = new Map<string, CatalogPack>();
  for (const [layer, m] of [['base', base], ['user', user]] as const) {
    for (const p of m.packs) packById.set(p.id, { ...p, summary: p.summary ?? '', layer });
  }
  const packs = [...packById.values()];

  const categories = mergeCategories(base.categories, user.categories, [...byId.values()]);
  const known = new Map(categories.map((c) => [c.id, c]));
  for (const c of categories) {
    if (c.parent && !known.get(c.parent)) {
      errors.push(`Категория «${c.title}»: родительская категория «${c.parent}» не найдена`);
      delete c.parent;
    }
  }
  const parents = new Set(categories.flatMap((c) => (c.parent ? [c.parent] : [])));
  const skills = [...byId.values()].map((s) =>
    parents.has(s.category) && !s.error
      ? {
          ...s,
          error: `Категория «${known.get(s.category)?.title ?? s.category}» разделена на подкатегории — укажите подкатегорию`,
        }
      : s,
  );

  return { categories, skills, packs, errors };
}
