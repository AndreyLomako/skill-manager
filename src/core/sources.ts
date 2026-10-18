import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Layer, SourceDef } from './types';

export type GitRunner = (args: string[], cwd?: string) => Promise<void>;

export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 120_000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr).trim() || err.message));
      else resolve();
    });
  });

const exists = (p: string) => access(p).then(() => true, () => false);

export function sourceCacheDir(cacheDir: string, layer: Layer, id: string): string {
  return path.join(cacheDir, `${layer}-${id}`);
}

export async function ensureSource(
  src: SourceDef,
  opts: { layer: Layer; manifestDir: string; cacheDir: string; update: boolean },
  git: GitRunner = runGit,
): Promise<string> {
  if (src.type === 'local') {
    const dir = path.resolve(opts.manifestDir, src.path);
    if (!(await exists(dir))) throw new Error(`Папка источника не найдена: ${dir}`);
    return dir;
  }

  const dir = sourceCacheDir(opts.cacheDir, opts.layer, src.id);
  if (await exists(path.join(dir, '.git'))) {
    if (opts.update) await git(['pull', '--ff-only'], dir);
    return dir;
  }

  await rm(dir, { recursive: true, force: true });
  await mkdir(opts.cacheDir, { recursive: true });
  const args = ['clone', '--depth', '1'];
  if (src.ref) args.push('--branch', src.ref);
  args.push('--', src.url, dir);
  await git(args);
  return dir;
}
