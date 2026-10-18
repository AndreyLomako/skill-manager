import type { NextRequest } from 'next/server';

// Защита от DNS rebinding: приложение слушает только 127.0.0.1:4317,
// поэтому принимаем запросы лишь с локальным Host.
const ALLOWED_HOSTS = new Set(['127.0.0.1:4317', 'localhost:4317']);

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
  }
}
