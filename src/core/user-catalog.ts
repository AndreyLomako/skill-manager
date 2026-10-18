import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyManifest, parseManifest } from './manifest';
import { USER_MANIFEST } from './paths';
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

export async function addUserSkill(userDir: string, input: NewUserSkill): Promise<{ skillId: string }> {
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

  let sourceId: string;
  if (existing) {
    sourceId = existing.id;
  } else {
    const base =
      input.kind === 'git'
        ? slugify(location.replace(/\/+$/, '').split('/').slice(-2).join('-'))
        : slugify(path.basename(localPath));
    sourceId = uniqueId(base || 'source', new Set(manifest.sources.map((s) => s.id)));
    const src: SourceDef =
      input.kind === 'git'
        ? { id: sourceId, type: 'git', url: location, ...(ref ? { ref } : {}) }
        : { id: sourceId, type: 'local', path: localPath };
    manifest.sources.push(src);
  }

  const skillPath = (input.skillPath ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const idBase = slugify(skillPath ? (skillPath.split('/').pop() ?? '') : sourceId) || 'skill';
  const skillId = uniqueId(idBase, new Set(manifest.skills.map((s) => s.id)));
  manifest.skills.push({ id: skillId, source: sourceId, path: skillPath, category });

  await mkdir(userDir, { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { skillId };
}
