import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RETRIES = 5;
const DELAY_MS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** rename with retries on EPERM/EBUSY/EACCES (Windows: antivirus/OneDrive briefly lock fresh files). */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < RETRIES) {
        await sleep(DELAY_MS);
        continue;
      }
      throw e;
    }
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  try {
    await renameWithRetry(tmp, file);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
