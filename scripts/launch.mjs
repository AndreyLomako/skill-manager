// Запуск Skill Manager: сборка при необходимости, сервер на 127.0.0.1 и окно Edge в режиме приложения.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const PORT = 4317;
const URL = `http://127.0.0.1:${PORT}`;
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

function newestMtime(path) {
  let st;
  try {
    st = statSync(path);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    newest = Math.max(newest, newestMtime(join(path, entry.name)));
  }
  return newest;
}

function needsBuild() {
  if (!existsSync('.next/BUILD_ID')) return true;
  const builtAt = statSync('.next/BUILD_ID').mtimeMs;
  const sources = ['src', 'package.json', 'next.config.ts', 'package-lock.json'];
  return sources.some((p) => newestMtime(p) > builtAt);
}

if (needsBuild()) {
  const build = spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], { stdio: 'inherit' });
server.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));

function stopServer() {
  if (process.platform === 'win32' && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  server.kill();
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopServer();
  });
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(URL);
      return true;
    } catch {
      // сервер ещё стартует
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (await waitForServer()) {
  spawn('cmd', ['/c', 'start', '', 'msedge', `--app=${URL}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  console.log(`Skill Manager открыт: ${URL}. Закройте это окно терминала, чтобы остановить сервер (закрытие окна Edge сервер не останавливает).`);
} else {
  console.error('Сервер не запустился за 60 секунд');
  stopServer();
  process.exit(1);
}
