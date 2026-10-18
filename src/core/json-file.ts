import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RETRIES = 5;
const DELAY_MS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY') && attempt < RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      await rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }
}
