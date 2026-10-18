import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['.git']);

async function listFiles(root: string, rel = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(root, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export async function hashDir(dir: string): Promise<string> {
  const files = (await listFiles(dir)).sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update('\0');
    h.update(await readFile(path.join(dir, f)));
    h.update('\0');
  }
  return h.digest('hex');
}
