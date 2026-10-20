import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureSource, gitErrorMessage, runGit, sourceCacheDir } from '../../src/core/sources';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const GIT_ID = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false'];

async function makeRepo(root: string): Promise<string> {
  const origin = path.join(root, 'origin');
  await writeFiles(origin, { 'skills/demo/SKILL.md': '---\nname: Demo\n---\nv1' });
  await runGit(['init', '-b', 'main'], origin);
  await runGit(['add', '.'], origin);
  await runGit([...GIT_ID, 'commit', '-m', 'v1'], origin);
  return origin;
}

describe('ensureSource', () => {
  it('local: путь относительно манифеста', async () => {
    const root = await tmpDir();
    await writeFiles(root, { 'cat/samples/x.txt': '1' });
    const dir = await ensureSource(
      { id: 's', type: 'local', path: './samples' },
      { layer: 'base', manifestDir: path.join(root, 'cat'), cacheDir: path.join(root, '.cache'), update: false },
    );
    expect(dir).toBe(path.join(root, 'cat', 'samples'));
  });

  it('local: ошибка, если папки нет', async () => {
    const root = await tmpDir();
    await expect(
      ensureSource(
        { id: 's', type: 'local', path: './nope' },
        { layer: 'base', manifestDir: root, cacheDir: root, update: false },
      ),
    ).rejects.toThrow(/не найдена/);
  });

  it('git: клонирует, а новые коммиты подтягивает только при update', async () => {
    const root = await tmpDir();
    const origin = await makeRepo(root);
    const cacheDir = path.join(root, '.cache');
    const src = { id: 'demo', type: 'git' as const, url: pathToFileURL(origin).href, ref: 'main' };
    const opts = { layer: 'user' as const, manifestDir: root, cacheDir };
    const file = (dir: string) => readFile(path.join(dir, 'skills', 'demo', 'SKILL.md'), 'utf8');

    const dir = await ensureSource(src, { ...opts, update: false });
    expect(dir).toBe(sourceCacheDir(cacheDir, 'user', 'demo'));
    expect(await file(dir)).toContain('v1');

    await writeFiles(origin, { 'skills/demo/SKILL.md': '---\nname: Demo\n---\nv2' });
    await runGit([...GIT_ID, 'commit', '-am', 'v2'], origin);

    await ensureSource(src, { ...opts, update: false });
    expect(await file(dir)).toContain('v1');

    await ensureSource(src, { ...opts, update: true });
    expect(await file(dir)).toContain('v2');
  });

  it('git: ошибка клонирования пробрасывается', async () => {
    const root = await tmpDir();
    await expect(
      ensureSource(
        { id: 'bad', type: 'git', url: pathToFileURL(path.join(root, 'missing')).href },
        { layer: 'base', manifestDir: root, cacheDir: path.join(root, '.cache'), update: false },
      ),
    ).rejects.toThrow();
  });

  it('git: url, начинающийся с "-", не трактуется как опция git', async () => {
    const root = await tmpDir();
    const calls: string[][] = [];
    const fake = async (args: string[]) => {
      calls.push(args);
      await mkdir(path.join(args[args.length - 1], '.git'), { recursive: true });
    };
    await ensureSource(
      { id: 'evil', type: 'git', url: '--upload-pack=calc' },
      { layer: 'base', manifestDir: root, cacheDir: path.join(root, '.cache'), update: false },
      fake,
    );
    const i = calls[0].indexOf('--upload-pack=calc');
    expect(calls[0][i - 1]).toBe('--');

    await expect(
      ensureSource(
        { id: 'evil2', type: 'git', url: '--upload-pack=calc' },
        { layer: 'base', manifestDir: root, cacheDir: path.join(root, '.cache'), update: false },
      ),
    ).rejects.toThrow();
  });

  it('git: неудачное обновление оставляет существующий клон и сообщает предупреждение', async () => {
    const root = await tmpDir();
    const cacheDir = path.join(root, '.cache');
    const dir = sourceCacheDir(cacheDir, 'user', 'demo');
    await mkdir(path.join(dir, '.git'), { recursive: true });
    const warnings: string[] = [];
    const failing = async () => {
      throw new Error('сеть недоступна');
    };
    const res = await ensureSource(
      { id: 'demo', type: 'git', url: 'https://example.invalid/r.git', ref: 'main' },
      { layer: 'user', manifestDir: root, cacheDir, update: true, onWarning: (m) => warnings.push(m) },
      failing,
    );
    expect(res).toBe(dir);
    expect(warnings).toEqual(['сеть недоступна']);
    await access(path.join(dir, '.git'));
  });

  it('git: обновление — fetch нужного ref и reset --hard FETCH_HEAD', async () => {
    const root = await tmpDir();
    const cacheDir = path.join(root, '.cache');
    const calls: { args: string[]; cwd?: string }[] = [];
    const fake = async (args: string[], cwd?: string) => {
      calls.push({ args, cwd });
    };
    const opts = { layer: 'base' as const, manifestDir: root, cacheDir, update: true };
    for (const id of ['tagged', 'plain']) {
      await mkdir(path.join(sourceCacheDir(cacheDir, 'base', id), '.git'), { recursive: true });
    }
    await ensureSource({ id: 'tagged', type: 'git', url: 'https://x/r.git', ref: 'v1.0' }, opts, fake);
    await ensureSource({ id: 'plain', type: 'git', url: 'https://x/r.git' }, opts, fake);
    const tagged = sourceCacheDir(cacheDir, 'base', 'tagged');
    const plain = sourceCacheDir(cacheDir, 'base', 'plain');
    expect(calls).toEqual([
      { args: ['fetch', '--depth', '1', '--', 'origin', 'v1.0'], cwd: tagged },
      { args: ['reset', '--hard', 'FETCH_HEAD'], cwd: tagged },
      { args: ['fetch', '--depth', '1', '--', 'origin', 'HEAD'], cwd: plain },
      { args: ['reset', '--hard', 'FETCH_HEAD'], cwd: plain },
    ]);
  });

  it('git: неудачный клон не оставляет ни папки, ни временной папки', async () => {
    const root = await tmpDir();
    const cacheDir = path.join(root, '.cache');
    const failing = async (args: string[]) => {
      const target = args[args.length - 1];
      await mkdir(path.join(target, '.git'), { recursive: true });
      await writeFile(path.join(target, 'partial.txt'), 'x');
      throw new Error('обрыв связи');
    };
    await expect(
      ensureSource(
        { id: 'demo', type: 'git', url: 'https://example.invalid/r.git' },
        { layer: 'base', manifestDir: root, cacheDir, update: false },
        failing,
      ),
    ).rejects.toThrow(/обрыв связи/);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it('git: параллельные вызовы для одного источника клонируют один раз', async () => {
    const root = await tmpDir();
    const cacheDir = path.join(root, '.cache');
    let clones = 0;
    const fake = async (args: string[]) => {
      if (args[0] === 'clone') clones++;
      await new Promise((r) => setTimeout(r, 30));
      await mkdir(path.join(args[args.length - 1], '.git'), { recursive: true });
    };
    const src = { id: 'demo', type: 'git' as const, url: 'https://example.invalid/r.git' };
    const opts = { layer: 'base' as const, manifestDir: root, cacheDir, update: false };
    const [a, b] = await Promise.all([ensureSource(src, opts, fake), ensureSource(src, opts, fake)]);
    expect(clones).toBe(1);
    expect(a).toBe(sourceCacheDir(cacheDir, 'base', 'demo'));
    expect(b).toBe(a);
    expect(await readdir(cacheDir)).toEqual(['base-demo']);
  });

  describe('git + sparse', () => {
    async function makeBigRepo(root: string): Promise<string> {
      const origin = path.join(root, 'origin');
      await writeFiles(origin, {
        'skills/demo/SKILL.md': '---\nname: Demo\n---\nv1',
        'skills/other/SKILL.md': '---\nname: Other\n---\nv1',
        'big/blob.txt': 'x'.repeat(200_000),
        'README.md': 'root file',
      });
      await runGit(['init', '-b', 'main'], origin);
      await runGit(['config', 'uploadpack.allowFilter', 'true'], origin);
      await runGit(['add', '.'], origin);
      await runGit([...GIT_ID, 'commit', '-m', 'v1'], origin);
      return origin;
    }
    const has = (p: string) => access(p).then(() => true, () => false);

    it('в рабочем дереве только нужные пути; новый путь добавляется без update', async () => {
      const root = await tmpDir();
      const origin = await makeBigRepo(root);
      const src = { id: 'big', type: 'git' as const, url: pathToFileURL(origin).href };
      const opts = { layer: 'base' as const, manifestDir: root, cacheDir: path.join(root, '.cache'), update: false };

      const dir = await ensureSource(src, { ...opts, sparse: ['skills/demo'] });
      expect(await has(path.join(dir, 'skills/demo/SKILL.md'))).toBe(true);
      expect(await has(path.join(dir, 'skills/other/SKILL.md'))).toBe(false);
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(false);

      await ensureSource(src, { ...opts, sparse: ['skills/demo', 'skills/other'] });
      expect(await has(path.join(dir, 'skills/other/SKILL.md'))).toBe(true);
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(false);
    });

    it('update подтягивает новый коммит и сохраняет набор путей', async () => {
      const root = await tmpDir();
      const origin = await makeBigRepo(root);
      const src = { id: 'big', type: 'git' as const, url: pathToFileURL(origin).href };
      const opts = { layer: 'base' as const, manifestDir: root, cacheDir: path.join(root, '.cache'), sparse: ['skills/demo'] };
      const dir = await ensureSource(src, { ...opts, update: false });

      await writeFiles(origin, { 'skills/demo/SKILL.md': '---\nname: Demo\n---\nv2' });
      await runGit([...GIT_ID, 'commit', '-am', 'v2'], origin);
      await ensureSource(src, { ...opts, update: true });

      expect(await readFile(path.join(dir, 'skills/demo/SKILL.md'), 'utf8')).toContain('v2');
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(false);
    });

    it('старый полный клон становится частичным', async () => {
      const root = await tmpDir();
      const origin = await makeBigRepo(root);
      const src = { id: 'big', type: 'git' as const, url: pathToFileURL(origin).href };
      const opts = { layer: 'base' as const, manifestDir: root, cacheDir: path.join(root, '.cache'), update: false };
      const dir = await ensureSource(src, opts);
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(true);

      await ensureSource(src, { ...opts, sparse: ['skills/demo'] });
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(false);
      expect(await has(path.join(dir, 'skills/demo/SKILL.md'))).toBe(true);
    });

    it('частичный клон становится полным, когда нужен весь репозиторий', async () => {
      const root = await tmpDir();
      const origin = await makeBigRepo(root);
      const src = { id: 'big', type: 'git' as const, url: pathToFileURL(origin).href };
      const opts = { layer: 'base' as const, manifestDir: root, cacheDir: path.join(root, '.cache'), update: false };
      const dir = await ensureSource(src, { ...opts, sparse: ['skills/demo'] });
      expect(await has(path.join(dir, 'README.md'))).toBe(false);

      await ensureSource(src, opts);
      expect(await has(path.join(dir, 'README.md'))).toBe(true);
      expect(await has(path.join(dir, 'skills/other/SKILL.md'))).toBe(true);
    });

    it('пути с «./» и «..» нормализуются; выходящие за корень отбрасываются', async () => {
      const root = await tmpDir();
      const origin = await makeBigRepo(root);
      const src = { id: 'big', type: 'git' as const, url: pathToFileURL(origin).href };
      const opts = { layer: 'base' as const, manifestDir: root, cacheDir: path.join(root, '.cache'), update: false };
      const dir = await ensureSource(src, { ...opts, sparse: ['./skills/demo', 'skills/x/../other', '../outside'] });
      expect(await has(path.join(dir, 'skills/demo/SKILL.md'))).toBe(true);
      expect(await has(path.join(dir, 'skills/other/SKILL.md'))).toBe(true);
      expect(await has(path.join(dir, 'big/blob.txt'))).toBe(false);
    });
  });
});

describe('git: устойчивость', () => {
  it('сбой клонирования повторяется один раз', async () => {
    const root = await tmpDir();
    let clones = 0;
    const flaky = async (args: string[]) => {
      if (args[0] === 'clone') {
        clones++;
        if (clones === 1) throw new Error('fatal: unable to access: SSL_ERROR_SYSCALL');
        await mkdir(path.join(args[args.length - 1], '.git'), { recursive: true });
      }
    };
    const dir = await ensureSource(
      { id: 'demo', type: 'git', url: 'https://example.invalid/r.git' },
      { layer: 'base', manifestDir: root, cacheDir: path.join(root, '.cache'), update: false, retryDelayMs: 0 },
      flaky,
    );
    expect(clones).toBe(2);
    expect(dir).toBe(sourceCacheDir(path.join(root, '.cache'), 'base', 'demo'));
  });

  it('gitErrorMessage оставляет строки fatal:/error:, без «Cloning into…» и подсказок', () => {
    const stderr = [
      "Cloning into 'C:\cache\base-x.tmp-1'...",
      "fatal: unable to access 'https://github.com/o/r.git/': OpenSSL SSL_connect: SSL_ERROR_SYSCALL",
      'fatal: could not fetch 7962dcf from promisor remote',
      "warning: Clone succeeded, but checkout failed.",
      "You can inspect what was checked out with 'git status'",
    ].join('\n');
    expect(gitErrorMessage(stderr, 'git clone')).toBe(
      "unable to access 'https://github.com/o/r.git/': OpenSSL SSL_connect: SSL_ERROR_SYSCALL; could not fetch 7962dcf from promisor remote",
    );
    expect(gitErrorMessage('', 'spawn git ENOENT')).toBe('spawn git ENOENT');
  });
});
