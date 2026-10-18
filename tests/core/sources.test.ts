import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureSource, runGit, sourceCacheDir } from '../../src/core/sources';
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
});
