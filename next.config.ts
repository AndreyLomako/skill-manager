import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const root = path.dirname(fileURLToPath(import.meta.url));

// Папки, которые не должны попасть в standalone-сборку (пользовательские данные, документация, сборки).
const TRACE_EXCLUDES = [
  'user/**',
  '.cache/**',
  '.beads/**',
  '.superpowers/**',
  'ref/**',
  'docs/**',
  'instruction_all/**',
  'dist/**',
  'electron/**',
  'build/**',
  'tests/**',
  // Репозиторий и конфиги агентов: трассировка путей в src/core (.git, .codex) иначе тащит их целиком.
  '.git/**',
  '.codex/**',
  '.claude/**',
  '.agents/**',
  // Серверу нужны только скомпилированные файлы; каталог приходит из resources/catalog.
  'src/**',
  'scripts/**',
  'catalog/**',
  'package-lock.json',
  '*.md',
  // next/image не используется; sharp трассируется под ОС сборщика (на mac x64 приезжал arm64-бинарник).
  'node_modules/sharp/**',
  'node_modules/@img/**',
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  outputFileTracingExcludes: { '*': TRACE_EXCLUDES },
};

export default nextConfig;
