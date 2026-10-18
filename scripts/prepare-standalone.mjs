// После `next build`: дополняет .next/standalone статикой и проверяет, что в сборку не попали пользовательские данные.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const standalone = join(root, '.next', 'standalone');

if (!existsSync(join(standalone, 'server.js'))) {
  console.error('Нет .next/standalone/server.js — сначала выполните `next build` с output: "standalone".');
  process.exit(1);
}

const staticDst = join(standalone, '.next', 'static');
rmSync(staticDst, { recursive: true, force: true });
cpSync(join(root, '.next', 'static'), staticDst, { recursive: true });

const forbidden = ['user', '.cache', '.beads'].filter((dir) => existsSync(join(standalone, dir)));
if (forbidden.length > 0) {
  console.error(`В standalone-сборку попали пользовательские данные: ${forbidden.join(', ')}. Проверьте outputFileTracingExcludes.`);
  process.exit(1);
}

console.log('standalone готов: .next/standalone (статика скопирована, пользовательских данных нет)');
