import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { sparsePaths } from './catalog';
import { writeJsonAtomic } from './json-file';
import { emptyManifest, parseManifest } from './manifest';
import { USER_MANIFEST } from './paths';
import { ensureSource, normalizeRepoPath, runGit, sourceCacheDir, type GitRunner } from './sources';
import type { Manifest, SourceDef } from './types';

export interface NewUserSkill {
  kind: 'git' | 'local';
  location: string;
  ref?: string;
  skillPath?: string;
  category: string;
  newCategoryTitle?: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

async function readUserManifest(file: string): Promise<Manifest> {
  try {
    return parseManifest(await readFile(file, 'utf8'), 'Мой каталог');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest();
    throw e;
  }
}

/** manifest — уже с новым скиллом (и новым источником, если он создан). */
export type VerifySkill = (source: SourceDef, skillPath: string, manifest: Manifest) => Promise<void>;

export async function addUserSkill(
  userDir: string,
  input: NewUserSkill,
  verify?: VerifySkill,
): Promise<{ skillId: string }> {
  if (input.kind !== 'git' && input.kind !== 'local') throw new Error('Неизвестный тип источника');
  const location = input.location.trim();
  if (!location) throw new Error('Укажите адрес репозитория или папку');
  const ref = input.ref?.trim() ?? '';

  const file = path.join(userDir, USER_MANIFEST);
  const manifest = await readUserManifest(file);

  let category = input.category.trim();
  if (!category) {
    const title = (input.newCategoryTitle ?? '').trim();
    if (!title) throw new Error('Выберите категорию или введите название новой');
    category = uniqueId(slugify(title) || 'custom', new Set(manifest.categories.map((c) => c.id)));
    manifest.categories.push({ id: category, title });
  }

  const localPath = input.kind === 'local' ? path.resolve(location) : '';
  const existing = manifest.sources.find((s) =>
    input.kind === 'git'
      ? s.type === 'git' && s.url === location && (s.ref ?? '') === ref
      : s.type === 'local' && path.resolve(userDir, s.path) === localPath,
  );

  let source: SourceDef;
  if (existing) {
    source = existing;
  } else {
    const base =
      input.kind === 'git'
        ? slugify(location.replace(/\/+$/, '').split('/').slice(-2).join('-'))
        : slugify(path.basename(localPath));
    const sourceId = uniqueId(base || 'source', new Set(manifest.sources.map((s) => s.id)));
    source =
      input.kind === 'git'
        ? { id: sourceId, type: 'git', url: location, ...(ref ? { ref } : {}) }
        : { id: sourceId, type: 'local', path: localPath };
    manifest.sources.push(source);
  }
  const sourceId = source.id;

  const skillPath = normalizeRepoPath((input.skillPath ?? '').trim());
  if (skillPath === null) throw new Error('Путь скилла выходит за пределы источника');
  if (/^[a-zA-Z]:/.test(skillPath)) throw new Error('Укажите путь к скиллу относительно источника');
  const idBase = slugify(skillPath ? (skillPath.split('/').pop() ?? '') : sourceId) || 'skill';
  const skillId = uniqueId(idBase, new Set(manifest.skills.map((s) => s.id)));
  manifest.skills.push({ id: skillId, source: sourceId, path: skillPath, category });

  if (verify) await verify(source, skillPath, manifest);
  await writeJsonAtomic(file, manifest);
  return { skillId };
}

const exists = (p: string) => access(p).then(() => true, () => false);

/**
 * Проверка нового скилла: источник загружается (git — частично, с путями всех его скиллов
 * из обновлённого манифеста, включая новый) и по пути есть SKILL.md.
 */
export async function verifyUserSkill(
  dirs: { userDir: string; cacheDir: string },
  src: SourceDef,
  skillPath: string,
  manifest: Manifest,
  git: GitRunner = runGit,
): Promise<void> {
  // Свежий клон, сделанный только ради проверки, удаляем при неудаче, чтобы его
  // не подхватил другой источник с тем же id.
  const cache = src.type === 'git' ? sourceCacheDir(dirs.cacheDir, 'user', src.id) : null;
  const hadCache = cache ? await exists(path.join(cache, '.git')) : true;
  // Докачка нового пути в частичный клон идёт по сети; её сбой — не «нет такого пути».
  const warnings: string[] = [];
  try {
    const dir = await ensureSource(
      src,
      {
        layer: 'user',
        manifestDir: dirs.userDir,
        cacheDir: dirs.cacheDir,
        update: false,
        sparse: src.type === 'git' ? sparsePaths(manifest, src.id) : undefined,
        onWarning: (msg) => warnings.push(msg),
      },
      git,
    );
    if (!(await exists(path.join(dir, skillPath, 'SKILL.md')))) {
      if (warnings.length > 0) throw new Error(`Не удалось загрузить «${skillPath}»: ${warnings.join('; ')}`);
      throw new Error(`SKILL.md не найден по пути «${skillPath}»`);
    }
  } catch (e) {
    if (cache && !hadCache) await rm(cache, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
