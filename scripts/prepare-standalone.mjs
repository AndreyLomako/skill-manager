// `clean` — до `next build`: удаляет старый .next/standalone (next build его не чистит, и мусор переживает пересборку).
// Без аргумента — после `next build`: дополняет standalone статикой и проверяет, что в нём нет ничего лишнего.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const standalone = join(root, '.next', 'standalone');

if (process.argv[2] === 'clean') {
  rmSync(standalone, { recursive: true, force: true });
  console.log('старый .next/standalone удалён');
  process.exit(0);
}

if (!existsSync(join(standalone, 'server.js'))) {
  console.error('Нет .next/standalone/server.js — сначала выполните `next build` с output: "standalone".');
  process.exit(1);
}

const staticDst = join(standalone, '.next', 'static');
rmSync(staticDst, { recursive: true, force: true });
cpSync(join(root, '.next', 'static'), staticDst, { recursive: true });

// Белый список верхнего уровня: всё остальное (.git, .codex, исходники, данные пользователя) — ошибка сборки.
const ALLOWED = new Set(['.next', 'node_modules', 'package.json', 'server.js']);
const extra = readdirSync(standalone).filter((name) => !ALLOWED.has(name));
if (extra.length > 0) {
  console.error(`В standalone-сборку попало лишнее: ${extra.join(', ')}. Проверьте outputFileTracingExcludes в next.config.ts.`);
  process.exit(1);
}

console.log('standalone готов: .next/standalone (статика скопирована, лишнего нет)');
