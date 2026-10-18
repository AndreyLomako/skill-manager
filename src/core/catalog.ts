import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { emptyManifest, parseManifest } from './manifest';
import { BASE_MANIFEST, USER_MANIFEST, type AppPaths } from './paths';
import { ensureSource, runGit, type GitRunner } from './sources';
import type { Catalog, CatalogSkill, CategoryDef, Layer, Manifest } from './types';

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

async function resolveLayer(
  layer: Layer,
  manifest: Manifest,
  manifestDir: string,
  cacheDir: string,
  update: boolean,
  git: GitRunner,
  errors: string[],
): Promise<CatalogSkill[]> {
  const sourceDirs = new Map<string, string | null>();
  for (const src of manifest.sources) {
    try {
      const onWarning = (msg: string) =>
        errors.push(`Источник «${src.id}» (${LAYER_LABEL[layer]}): не удалось обновить — ${msg}`);
      sourceDirs.set(src.id, await ensureSource(src, { layer, manifestDir, cacheDir, update, onWarning }, git));
    } catch (e) {
      sourceDirs.set(src.id, null);
      errors.push(`Источник «${src.id}» (${LAYER_LABEL[layer]}): ${(e as Error).message}`);
    }
  }

  const skills: CatalogSkill[] = [];
  for (const def of manifest.skills) {
    const base = {
      id: def.id,
      category: def.category,
      layer,
      title: def.title ?? def.id,
      description: def.description ?? '',
    };
    const srcDir = sourceDirs.get(def.source) ?? null;
    if (!srcDir) {
      skills.push({ ...base, dir: null, error: 'Источник недоступен' });
      continue;
    }
    const dir = path.resolve(srcDir, def.path);
    if (!isInside(srcDir, dir)) {
      skills.push({ ...base, dir: null, error: 'Путь скилла выходит за пределы источника' });
      continue;
    }
    let md: string;
    try {
      md = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
    } catch {
      skills.push({ ...base, dir: null, error: 'SKILL.md не найден' });
      continue;
    }
    const fm = readFrontmatter(md);
    skills.push({
      ...base,
      dir,
      title: def.title ?? fm.name ?? def.id,
      description: def.description ?? fm.description ?? '',
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
  for (const c of [...base, ...user]) map.set(c.id, c);
  for (const s of skills) if (!map.has(s.category)) map.set(s.category, { id: s.category, title: s.category });
  return [...map.values()].sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.title.localeCompare(b.title, 'ru'),
  );
}

export async function loadCatalog(
  paths: AppPaths,
  opts: { update?: boolean } = {},
  git: GitRunner = runGit,
): Promise<Catalog> {
  const errors: string[] = [];
  const update = opts.update ?? false;

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

  const baseSkills = await resolveLayer('base', base, paths.baseCatalogDir, paths.cacheDir, update, git, errors);
  const userSkills = await resolveLayer('user', user, paths.userDir, paths.cacheDir, update, git, errors);

  const byId = new Map<string, CatalogSkill>();
  for (const s of [...baseSkills, ...userSkills]) byId.set(s.id, s);
  const skills = [...byId.values()];

  return { categories: mergeCategories(base.categories, user.categories, skills), skills, errors };
}
