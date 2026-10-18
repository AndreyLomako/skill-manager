import type { NextRequest } from 'next/server';
import { isAllowedHost } from './core/allowed-hosts';

// Защита от DNS rebinding: порт — SKILL_MANAGER_PORT (Electron) или 4317.
export function proxy(request: NextRequest) {
  if (!isAllowedHost(request.headers.get('host'))) {
    return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
  }
}
