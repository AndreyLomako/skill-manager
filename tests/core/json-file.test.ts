import { afterEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../../src/core/json-file';
import { cleanupTmp, tmpDir } from '../helpers/tmp';

afterEach(cleanupTmp);

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
});
