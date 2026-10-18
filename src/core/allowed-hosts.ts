export const DEFAULT_PORT = '4317';

// Защита от DNS rebinding: сервер слушает только 127.0.0.1:<порт>,
// поэтому принимаем запросы лишь с локальным Host.
export function isAllowedHost(
  host: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const port = env.SKILL_MANAGER_PORT ?? DEFAULT_PORT;
  const h = (host ?? '').toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}
