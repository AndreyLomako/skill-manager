// Замер: через сколько VS Code записывает новое окно в storage.json и убирает его после закрытия.
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const storage = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'storage.json');
const dir = await mkdtemp(path.join(os.tmpdir(), 'sm-probe-'));

async function isListed() {
  try {
    const state = JSON.parse(await readFile(storage, 'utf8')).windowsState ?? {};
    return (state.openedWindows ?? []).some((w) => {
      try {
        return Boolean(w.folder) && fileURLToPath(w.folder, { windows: true }).toLowerCase() === dir.toLowerCase();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function waitFor(expected, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await isListed()) === expected) return Date.now() - start;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

console.log(`Открываю новое окно VS Code: ${dir}`);
spawn('code', ['-n', dir], { shell: true, stdio: 'ignore', detached: true }).unref();
const opened = await waitFor(true, 30_000);
console.log(opened === null ? 'ОТКРЫТИЕ: не появилось за 30 с' : `ОТКРЫТИЕ: появилось через ${opened} мс`);
console.log('Теперь закройте это окно VS Code (жду до 120 с)…');
const closed = await waitFor(false, 120_000);
console.log(closed === null ? 'ЗАКРЫТИЕ: не исчезло за 120 с' : `ЗАКРЫТИЕ: исчезло через ${closed} мс`);
