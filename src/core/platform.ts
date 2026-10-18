import { execFile } from 'node:child_process';
import path from 'node:path';

export type Platform = NodeJS.Platform;

export interface RunResult {
  code: number;
  stdout: string;
}
export type RunFn = (cmd: string, args: string[]) => Promise<RunResult>;

export function pathApi(platform: Platform = process.platform): typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix;
}

// Ключ сравнения путей: Windows и macOS (APFS по умолчанию) нечувствительны к регистру, Linux — нет.
export function pathKey(p: string, platform: Platform = process.platform): string {
  return platform === 'win32' || platform === 'darwin' ? p.toLowerCase() : p;
}

export function vscodeStoragePath(
  env: Record<string, string | undefined>,
  home: string,
  platform: Platform = process.platform,
): string {
  const tail = ['Code', 'User', 'globalStorage', 'storage.json'];
  if (platform === 'win32') return path.win32.join(env.APPDATA ?? '', ...tail);
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', ...tail);
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, '.config'), ...tail);
}

const defaultRun: RunFn = (cmd, args) =>
  new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true }, (err, stdout) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? (err.code as unknown as number) : 1) : 0;
        resolve({ code, stdout: String(stdout ?? '') });
      });
    } catch {
      resolve({ code: 1, stdout: '' });
    }
  });

// Не бросает: любая ошибка запуска означает «не запущен».
// Запись платформы: строка (win32 — имя образа для tasklist, иначе `pgrep -x имя`)
// или { pgrep: [...] } — готовые аргументы pgrep (например, поиск по пути через -f).
export type ProcessSpec = string | { pgrep: string[] };

export async function isProcessRunning(
  names: Partial<Record<Platform, ProcessSpec>>,
  platform: Platform = process.platform,
  run: RunFn = defaultRun,
): Promise<boolean> {
  const spec = names[platform];
  if (!spec) return false;
  try {
    if (typeof spec === 'object') return (await run('pgrep', spec.pgrep)).code === 0;
    if (platform === 'win32') {
      const r = await run('tasklist', ['/FI', `IMAGENAME eq ${spec}`, '/NH']);
      return r.code === 0 && r.stdout.toLowerCase().includes(spec.toLowerCase());
    }
    return (await run('pgrep', ['-x', spec])).code === 0;
  } catch {
    return false;
  }
}
