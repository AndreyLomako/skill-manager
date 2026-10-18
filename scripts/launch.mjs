// Запуск Skill Manager: сборка при необходимости, сервер на 127.0.0.1 и окно Edge в режиме приложения.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Все относительные пути ниже (.next, src, …) — от корня репозитория, откуда бы ни запустили скрипт.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const PORT = 4317;
const URL_APP = `http://127.0.0.1:${PORT}`;
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
  const sources = ['src', 'package.json', 'next.config.ts', 'package-lock.json', 'tsconfig.json'];
  return sources.some((p) => newestMtime(p) > builtAt);
}

async function answers() {
  try {
    await fetch(URL_APP, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

function openEdge() {
  spawn('cmd', ['/c', 'start', '', 'msedge', `--app=${URL_APP}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// Уже запущен (например, во втором окне терминала) — просто открываем окно.
if (await answers()) {
  openEdge();
  console.log(`Skill Manager уже запущен: ${URL_APP}`);
  process.exit(0);
}

if (needsBuild()) {
  const build = spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

let stopping = false;
const server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(PORT)], { stdio: 'inherit' });
server.on('exit', (code, signal) => process.exit(stopping ? 0 : signal ? 1 : (code ?? 0)));

function stopServer() {
  if (process.platform === 'win32' && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  server.kill();
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    // Пользователь остановил приложение — это штатное завершение.
    stopping = true;
    process.exitCode = 0;
    stopServer();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (await answers()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (await waitForServer()) {
  openEdge();
  console.log(`Skill Manager открыт: ${URL_APP}. Закройте это окно терминала, чтобы остановить сервер (закрытие окна Edge сервер не останавливает).`);
} else if (!stopping) {
  console.error('Сервер не запустился за 60 секунд');
  stopServer();
  process.exit(1);
}
