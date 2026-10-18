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
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  outputFileTracingExcludes: { '*': TRACE_EXCLUDES },
};

export default nextConfig;
