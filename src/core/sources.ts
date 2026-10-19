import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from './json-file';
import type { Layer, SourceDef } from './types';

export type GitRunner = (args: string[], cwd?: string) => Promise<void>;

export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        windowsHide: true,
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(String(stderr).trim() || err.message));
        else resolve();
      },
    );
  });

const exists = (p: string) => access(p).then(() => true, () => false);

export function sourceCacheDir(cacheDir: string, layer: Layer, id: string): string {
  return path.join(cacheDir, `${layer}-${id}`);
}

export interface EnsureSourceOpts {
  layer: Layer;
  manifestDir: string;
  cacheDir: string;
  update: boolean;
  onWarning?: (msg: string) => void;
  /** Только эти пути источника (git): частичный клон без лишних файлов. */
  sparse?: string[];
}

// Набор путей частичного клона, с которым синхронизировано рабочее дерево.
const SPARSE_MARK = 'skill-manager-sparse.json';

function sparseSet(paths: string[] | undefined): string[] | null {
  if (!paths || paths.length === 0) return null;
  const norm = paths.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  return norm.length > 0 ? [...new Set(norm)].sort() : null;
}

async function applySparse(dir: string, paths: string[], git: GitRunner): Promise<void> {
  // no-cone: шаблоны как в .gitignore; «/path/» — ровно эта папка от корня репозитория.
  await git(['sparse-checkout', 'set', '--no-cone', '--', ...paths.map((p) => `/${p}/`)], dir);
  await writeFile(path.join(dir, '.git', SPARSE_MARK), JSON.stringify(paths));
}

async function sparseMark(dir: string): Promise<string | null> {
  try {
    return await readFile(path.join(dir, '.git', SPARSE_MARK), 'utf8');
  } catch {
    return null;
  }
}

/** One in-flight git operation per cache dir; concurrent callers share it. */
const locks = new Map<string, Promise<string>>();

export async function ensureSource(
  src: SourceDef,
  opts: EnsureSourceOpts,
  git: GitRunner = runGit,
): Promise<string> {
  if (src.type === 'local') {
    const dir = path.resolve(opts.manifestDir, src.path);
    if (!(await exists(dir))) throw new Error(`Папка источника не найдена: ${dir}`);
    return dir;
  }

  const dir = sourceCacheDir(opts.cacheDir, opts.layer, src.id);
  const pending = locks.get(dir);
  if (pending) return pending;
  const op = ensureGitSource(src, dir, opts, git).finally(() => {
    if (locks.get(dir) === op) locks.delete(dir);
  });
  locks.set(dir, op);
  return op;
}

async function ensureGitSource(
  src: Extract<SourceDef, { type: 'git' }>,
  dir: string,
  opts: EnsureSourceOpts,
  git: GitRunner,
): Promise<string> {
  const sparse = sparseSet(opts.sparse);
  if (await exists(path.join(dir, '.git'))) {
    if (opts.update) {
      try {
        const filter = sparse ? ['--filter=blob:none'] : [];
        await git(['fetch', '--depth', '1', ...filter, '--', 'origin', src.ref || 'HEAD'], dir);
        await git(['reset', '--hard', 'FETCH_HEAD'], dir);
      } catch (e) {
        opts.onWarning?.((e as Error).message);
      }
    }
    // Набор путей поменялся (в каталоге новый скилл из этого источника) или клон был полным.
    if (sparse && (await sparseMark(dir)) !== JSON.stringify(sparse)) {
      try {
        await applySparse(dir, sparse, git);
      } catch (e) {
        opts.onWarning?.((e as Error).message);
      }
    }
    return dir;
  }

  await mkdir(opts.cacheDir, { recursive: true });
  const tmp = `${dir}.tmp-${Date.now()}`;
  const args = ['clone', '--depth', '1'];
  // Сервер без поддержки фильтра просто пришлёт всё — git предупредит и продолжит.
  if (sparse) args.push('--filter=blob:none', '--sparse');
  if (src.ref) args.push('--branch', src.ref);
  args.push('--', src.url, tmp);
  try {
    await git(args);
    if (sparse) await applySparse(tmp, sparse, git);
    await rm(dir, { recursive: true, force: true });
    await renameWithRetry(tmp, dir);
  } catch (e) {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
  return dir;
}
