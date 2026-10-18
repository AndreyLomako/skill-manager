import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry, writeJsonAtomic } from '../../src/core/json-file';
import { cleanupTmp, tmpDir } from '../helpers/tmp';

const failures = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    rename: async (from: string, to: string) => {
      const code = failures.codes.shift();
      if (code) throw Object.assign(new Error(code), { code });
      return real.rename(from, to);
    },
  };
});

afterEach(async () => {
  failures.codes = [];
  vi.restoreAllMocks();
  await cleanupTmp();
});

describe('writeJsonAtomic', () => {
  it('создаёт папку, пишет и заменяет файл без временных хвостов', async () => {
    const dir = path.join(await tmpDir(), 'nested', 'user');
    const file = path.join(dir, 'data.json');
    await writeJsonAtomic(file, { a: 1 });
    expect(await readFile(file, 'utf8')).toBe('{\n  "a": 1\n}\n');
    await writeJsonAtomic(file, { b: [2] });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ b: [2] });
    expect(await readdir(dir)).toEqual(['data.json']);
  });

  it('параллельные записи в одну миллисекунду не делят временный файл', async () => {
    const dir = await tmpDir();
    const file = path.join(dir, 'data.json');
    vi.spyOn(Date, 'now').mockReturnValue(1);
    await Promise.all(Array.from({ length: 5 }, (_, i) => writeJsonAtomic(file, { i })));
    expect(await readdir(dir)).toEqual(['data.json']);
  });
});

describe('renameWithRetry', () => {
  it('повторяет при EACCES', async () => {
    const dir = await tmpDir();
    const from = path.join(dir, 'a');
    const to = path.join(dir, 'b');
    await writeFile(from, 'x');
    failures.codes = ['EACCES', 'EACCES'];
    await renameWithRetry(from, to);
    expect(await readFile(to, 'utf8')).toBe('x');
  });
});
