// Рендерит build/icon.html headless-Edge в build/icon.png (512×512) и собирает build/icon.ico (PNG внутри ICO).
// Запуск вручную при изменении иконки: node scripts/make-icon.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = pathToFileURL(join(root, 'build', 'icon.html')).href;
const edge = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForFile(file) {
  let last = -1;
  for (let i = 0; i < 120; i++) {
    const size = existsSync(file) ? statSync(file).size : -1;
    if (size > 0 && size === last) return;
    last = size;
    sleep(500);
  }
  throw new Error(`Edge не записал ${file} за 60 с`);
}

function render(size, out) {
  const r = spawnSync(edge, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=${profile}`,
    '--default-background-color=00000000',
    '--window-size=512,512',
    `--force-device-scale-factor=${size / 512}`,
    `--screenshot=${out}`,
    html,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`Edge завершился с кодом ${r.status}`);
  // msedge.exe — лаунчер: он выходит раньше, чем дочерний процесс запишет скриншот.
  waitForFile(out);
  const png = readFileSync(out);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  if (w !== size || h !== size) throw new Error(`Ожидался PNG ${size}×${size}, получен ${w}×${h}`);
  return png;
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const work = mkdtempSync(join(tmpdir(), 'sm-icon-'));
const profile = join(work, 'profile');
try {
  writeFileSync(join(root, 'build', 'icon.png'), render(512, join(work, '512.png')));
  const images = ICO_SIZES.map((size) => ({ size, png: render(size, join(work, `${size}.png`)) }));
  writeFileSync(join(root, 'build', 'icon.ico'), ico(images));
  console.log(`build/icon.png (512×512) и build/icon.ico (${ICO_SIZES.join(', ')}) готовы`);
} finally {
  // Фоновые процессы Edge могут ещё держать профиль — удаляем по возможности.
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch {
    console.warn(`Не удалось удалить временную папку ${work}`);
  }
}
