// Запуск Skill Manager: сборка при необходимости, сервер на 127.0.0.1 и окно Edge в режиме приложения.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 4317;
const URL = `http://127.0.0.1:${PORT}`;

if (!existsSync('.next/BUILD_ID')) {
  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], { stdio: 'inherit', shell: true });
server.on('exit', (code) => process.exit(code ?? 0));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL)).ok) return true;
    } catch {
      // сервер ещё стартует
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (await waitForServer()) {
  spawn('cmd', ['/c', 'start', '', 'msedge', `--app=${URL}`], { detached: true, stdio: 'ignore' }).unref();
  console.log(`Skill Manager открыт: ${URL}. Закройте это окно терминала, чтобы остановить сервер.`);
} else {
  console.error('Сервер не запустился за 60 секунд');
  server.kill();
  process.exit(1);
}
