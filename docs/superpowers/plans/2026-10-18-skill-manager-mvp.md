# Skill Manager MVP — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальное Next.js-приложение, которое показывает проекты, открытые в VS Code, и по клику ставит выбранные скиллы Claude Code в `<проект>/.claude/skills/`.

**Architecture:** Чистая логика в `src/core/` (без Next.js, покрыта Vitest), тонкие Server Actions в `src/app/actions.ts`, клиентский интерфейс в `src/components/` (CSS Modules, Three.js для круга). Каталог — два JSON-манифеста: базовый `catalog/catalog.json` и пользовательский `user/user-catalog.json` (в `.gitignore`).

**Tech Stack:** Node 24, Next.js 16 (App Router, Server Actions), React 19, TypeScript, Three.js 0.186, yaml 2, Vitest 5.

**Спецификация:** [docs/superpowers/specs/2026-10-18-skill-manager-mvp-design.md](../specs/2026-10-18-skill-manager-mvp-design.md)

## Global Constraints

- Платформа: Windows 11, Node ≥ 24 (установлен 24.19.0).
- Сервер слушает только `127.0.0.1:4317` (`next dev|start -H 127.0.0.1 -p 4317`).
- Только Server Actions, никаких `app/api/*` route handlers.
- Зависимости runtime: `next`, `react`, `react-dom`, `three`, `yaml`. Dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/three`, `vitest`. Других пакетов не добавлять.
- Никаких CDN и удалённых шрифтов: системный шрифт `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`.
- `src/core/*` не импортирует ничего из `next` и использует относительные импорты; тесты импортируют `../../src/core/...`.
- CSS Modules, имена классов в стиле BEM: `block`, `block__element`, `block--modifier` (доступ через `styles['block__element']`). CSS-переменные — в `src/app/globals.css`.
- Запись на диск разрешена только в `<проект>/.claude/skills/`, `user/`, `.cache/`.
- Весь текст интерфейса — на русском.
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Context7 в сессии недоступен: перед использованием API Next.js / Three.js сверяться с типами в `node_modules` и nextjs.org / threejs.org (WebFetch).

## Карта файлов

| Файл | Ответственность |
|---|---|
| `src/core/types.ts` | Общие типы (манифест, каталог, проекты, установка) |
| `src/core/paths.ts` | Пути приложения и имена файлов манифестов |
| `src/core/vscode-windows.ts` | Открытые окна VS Code из `storage.json`, проверка, запущен ли VS Code |
| `src/core/projects.ts` | `user/settings.json`, слияние открытых/недавних/ручных проектов |
| `src/core/frontmatter.ts` | `name`/`description` из frontmatter `SKILL.md` |
| `src/core/manifest.ts` | Разбор и валидация манифеста |
| `src/core/sources.ts` | Локальные и git-источники (клон/pull в `.cache/`) |
| `src/core/catalog.ts` | Загрузка и слияние двух слоёв каталога |
| `src/core/hash.ts` | SHA-256 содержимого папки |
| `src/core/installer.ts` | Установка скиллов, статус установленных |
| `src/core/user-catalog.ts` | Добавление скилла в пользовательский слой |
| `src/core/selection.ts` | Чистые функции корзины выбора |
| `src/app/actions.ts` | Server Actions — обёртки над core |
| `src/app/page.tsx`, `layout.tsx`, `globals.css` | Страница, оболочка, глобальные стили |
| `src/components/*` | `Tile`, `Blob`, `ProjectList`, `CategoryRing`, `SkillTiles`, `Cart`, `Dialog`, `AddSkillDialog`, `ErrorScreen`, `SkillManager` |
| `catalog/catalog.json`, `catalog/samples/*` | Базовый каталог с 4 тестовыми скиллами |
| `scripts/probe-vscode.mjs` | Замер задержки обновления `storage.json` |
| `scripts/launch.mjs` | Сборка (если нужно), запуск сервера и окна Edge |
| `tests/helpers/tmp.ts`, `tests/core/*.test.ts` | Тесты |

---

### Task 1: Каркас проекта Next.js + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Modify: `.gitignore` (создать, если нет; если есть — дописать строки)

**Interfaces:**
- Produces: npm-скрипты `dev`, `build`, `start`, `app`, `test`; алиас `@/*` → `src/*`.

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "skill-manager",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -H 127.0.0.1 -p 4317",
    "build": "next build",
    "start": "next start -H 127.0.0.1 -p 4317",
    "app": "node scripts/launch.mjs",
    "test": "vitest run",
    "probe": "node scripts/probe-vscode.mjs"
  }
}
```

- [ ] **Step 2: Установить зависимости**

Run:
```powershell
npm install next@16 react@19 react-dom@19 three@0.186 yaml@2
npm install -D typescript @types/node @types/react @types/react-dom @types/three vitest@5
```
Expected: обе команды без `ERR!`.

- [ ] **Step 3: Создать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".cache", "user"]
}
```

- [ ] **Step 4: Создать `next.config.ts` и `vitest.config.ts`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
```

- [ ] **Step 5: Создать `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Manager',
  description: 'Установка скиллов Claude Code в проекты VS Code',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>Skill Manager</main>;
}
```

`src/app/globals.css`:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
```

- [ ] **Step 6: Дописать `.gitignore`**

Добавить строки (не удаляя существующие):
```
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo
.env*.local
user/
.cache/
```

- [ ] **Step 7: Проверить сборку**

Run: `npm run build`
Expected: `✓ Compiled successfully`, код выхода 0. Если сборка падает из-за TypeScript 7 (несовместимость с проверкой типов Next.js) — `npm install -D typescript@6` и повторить; зафиксировать выбранную версию в сообщении коммита.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts src .gitignore
git commit -m "chore: scaffold Next.js app with Vitest`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Замер задержки `storage.json` (проверка риска)

**Files:**
- Create: `scripts/probe-vscode.mjs`
- Modify: `docs/superpowers/specs/2026-10-18-skill-manager-mvp-design.md` (раздел 5, строка «Риск»)

**Interfaces:**
- Produces: зафиксированная в спецификации задержка открытия/закрытия окна.

- [ ] **Step 1: Создать `scripts/probe-vscode.mjs`**

```js
// Замер: через сколько VS Code записывает новое окно в storage.json и убирает его после закрытия.
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const storage = path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'storage.json');
const dir = await mkdtemp(path.join(os.tmpdir(), 'sm-probe-'));

async function isListed() {
  try {
    const state = JSON.parse(await readFile(storage, 'utf8')).windowsState ?? {};
    return (state.openedWindows ?? []).some((w) => {
      try {
        return Boolean(w.folder) && fileURLToPath(w.folder, { windows: true }).toLowerCase() === dir.toLowerCase();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function waitFor(expected, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await isListed()) === expected) return Date.now() - start;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

console.log(`Открываю новое окно VS Code: ${dir}`);
spawn('code', ['-n', dir], { shell: true, stdio: 'ignore', detached: true }).unref();
const opened = await waitFor(true, 30_000);
console.log(opened === null ? 'ОТКРЫТИЕ: не появилось за 30 с' : `ОТКРЫТИЕ: появилось через ${opened} мс`);
console.log('Теперь закройте это окно VS Code (жду до 120 с)…');
const closed = await waitFor(false, 120_000);
console.log(closed === null ? 'ЗАКРЫТИЕ: не исчезло за 120 с' : `ЗАКРЫТИЕ: исчезло через ${closed} мс`);
```

- [ ] **Step 2: Запустить замер**

Run: `npm run probe` (попросить пользователя закрыть открывшееся окно VS Code, когда скрипт попросит).
Expected: две строки `ОТКРЫТИЕ: …` и `ЗАКРЫТИЕ: …` с числами.

- [ ] **Step 3: Записать результат в спецификацию**

В разделе 5 заменить строку, начинающуюся с `- **Риск:**`, на:
```
- **Риск (проверено YYYY-MM-DD):** окно появляется в `storage.json` через <N> мс после открытия и исчезает через <M> мс после закрытия. <Вывод: укладываемся в 5 с / нет — мини-расширение VS Code в следующую часть.>
```
(подставить дату и реальные числа из Step 2).

- [ ] **Step 4: Commit**

```powershell
git add scripts/probe-vscode.mjs docs/superpowers/specs/2026-10-18-skill-manager-mvp-design.md
git commit -m "chore: probe VS Code storage.json update latency`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Типы, пути и чтение окон VS Code

**Files:**
- Create: `src/core/types.ts`, `src/core/paths.ts`, `src/core/vscode-windows.ts`, `tests/helpers/tmp.ts`
- Test: `tests/core/paths.test.ts`, `tests/core/vscode-windows.test.ts`

**Interfaces:**
- Produces:
  - типы из `types.ts` (полный код ниже) — используются всеми задачами;
  - `BASE_MANIFEST = 'catalog.json'`, `USER_MANIFEST = 'user-catalog.json'`, `interface AppPaths { baseCatalogDir; userDir; cacheDir; vscodeStorage: string }`, `resolveAppPaths(env?, root?): AppPaths`;
  - `interface VsCodeWindows { open: string[]; active: string | null; error?: string }`, `normalizeWinPath(p): string`, `fileUriToPath(uri): string | null`, `readOpenWindows(storagePath): Promise<VsCodeWindows>`, `isVsCodeRunning(): Promise<boolean>`;
  - тестовые хелперы `tmpDir()`, `writeFiles(root, files)`, `cleanupTmp()`.

- [ ] **Step 1: Создать `src/core/types.ts` (только типы, без логики)**

```ts
export type Layer = 'base' | 'user';

export interface CategoryDef {
  id: string;
  title: string;
  order?: number;
}

export type SourceDef =
  | { id: string; type: 'local'; path: string }
  | { id: string; type: 'git'; url: string; ref?: string };

export interface SkillDef {
  id: string;
  source: string;
  path: string;
  category: string;
  title?: string;
  description?: string;
}

export interface Manifest {
  version: 1;
  categories: CategoryDef[];
  sources: SourceDef[];
  skills: SkillDef[];
}

export interface CatalogSkill {
  id: string;
  title: string;
  description: string;
  category: string;
  layer: Layer;
  dir: string | null;
  error?: string;
}

export interface Catalog {
  categories: CategoryDef[];
  skills: CatalogSkill[];
  errors: string[];
}

export interface Project {
  path: string;
  name: string;
  open: boolean;
  active: boolean;
}

export type InstallStatus = 'installed' | 'already-installed' | 'error';

export interface InstallResult {
  skillId: string;
  status: InstallStatus;
  message?: string;
}

export type InstalledStatus = 'up-to-date' | 'outdated' | 'unknown';
export type InstalledState = Record<string, InstalledStatus>;
```

- [ ] **Step 2: Создать `tests/helpers/tmp.ts`**

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const created: string[] = [];

export async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sm-test-'));
  created.push(dir);
  return dir;
}

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf8');
  }
}

export async function cleanupTmp(): Promise<void> {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
}
```

- [ ] **Step 3: Написать падающий тест `tests/core/paths.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveAppPaths } from '../../src/core/paths';

describe('resolveAppPaths', () => {
  it('по умолчанию использует папки внутри приложения', () => {
    expect(resolveAppPaths({ APPDATA: 'C:\\AppData' }, 'C:\\app')).toEqual({
      baseCatalogDir: path.join('C:\\app', 'catalog'),
      userDir: path.join('C:\\app', 'user'),
      cacheDir: path.join('C:\\app', '.cache'),
      vscodeStorage: path.join('C:\\AppData', 'Code', 'User', 'globalStorage', 'storage.json'),
    });
  });

  it('учитывает переменные окружения', () => {
    const p = resolveAppPaths(
      {
        APPDATA: 'C:\\AppData',
        SKILL_MANAGER_USER_DIR: 'D:\\my',
        SKILL_MANAGER_CATALOG_DIR: 'D:\\cat',
        SKILL_MANAGER_VSCODE_STORAGE: 'D:\\s.json',
      },
      'C:\\app',
    );
    expect(p.userDir).toBe('D:\\my');
    expect(p.baseCatalogDir).toBe('D:\\cat');
    expect(p.vscodeStorage).toBe('D:\\s.json');
  });
});
```

- [ ] **Step 4: Запустить — должен упасть**

Run: `npx vitest run tests/core/paths.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/paths"`.

- [ ] **Step 5: Создать `src/core/paths.ts`**

```ts
import path from 'node:path';

export const BASE_MANIFEST = 'catalog.json';
export const USER_MANIFEST = 'user-catalog.json';

export interface AppPaths {
  baseCatalogDir: string;
  userDir: string;
  cacheDir: string;
  vscodeStorage: string;
}

export function resolveAppPaths(
  env: NodeJS.ProcessEnv = process.env,
  root: string = process.cwd(),
): AppPaths {
  return {
    baseCatalogDir: env.SKILL_MANAGER_CATALOG_DIR ?? path.join(root, 'catalog'),
    userDir: env.SKILL_MANAGER_USER_DIR ?? path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage:
      env.SKILL_MANAGER_VSCODE_STORAGE ??
      path.join(env.APPDATA ?? '', 'Code', 'User', 'globalStorage', 'storage.json'),
  };
}
```

- [ ] **Step 6: Запустить — должен пройти**

Run: `npx vitest run tests/core/paths.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 7: Написать падающий тест `tests/core/vscode-windows.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileUriToPath, readOpenWindows } from '../../src/core/vscode-windows';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const storage = (windowsState: unknown) => JSON.stringify({ theme: 'vs-dark', windowsState });

describe('fileUriToPath', () => {
  it('декодирует диск, кириллицу и пробелы', () => {
    expect(
      fileUriToPath('file:///c%3A/Users/%D0%98%D0%B2%D0%B0%D0%BD/OneDrive/Desktop/my%20app'),
    ).toBe('C:\\Users\\Иван\\OneDrive\\Desktop\\my app');
  });

  it('возвращает null для не-file URI', () => {
    expect(fileUriToPath('vscode-remote://wsl+Ubuntu/home/x')).toBeNull();
  });
});

describe('readOpenWindows', () => {
  it('берёт папки окон, пропускает пустые и убирает дубликаты', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, {
      'storage.json': storage({
        lastActiveWindow: { folder: 'file:///c%3A/work/b' },
        openedWindows: [
          { folder: 'file:///c%3A/work/a' },
          { backupPath: 'C:\\backup' },
          { folder: 'file:///c%3A/work/b' },
        ],
      }),
    });
    expect(await readOpenWindows(path.join(dir, 'storage.json'))).toEqual({
      open: ['C:\\work\\a', 'C:\\work\\b'],
      active: 'C:\\work\\b',
    });
  });

  it('раскрывает папки из .code-workspace', async () => {
    const dir = await tmpDir();
    const ws = path.join(dir, 'proj', 'my.code-workspace');
    await writeFiles(dir, {
      'proj/my.code-workspace':
        '{\n  // комментарий\n  "folders": [{ "path": "front" }, { "path": "../back" },]\n}',
      'storage.json': storage({
        openedWindows: [{ workspace: { id: '1', configPath: pathToFileURL(ws).href } }],
      }),
    });
    const res = await readOpenWindows(path.join(dir, 'storage.json'));
    expect(res.open.map((p) => p.toLowerCase())).toEqual(
      [path.join(dir, 'proj', 'front'), path.join(dir, 'back')].map((p) => p.toLowerCase()),
    );
    expect(res.active).toBeNull();
  });

  it('сообщает об ошибке, если файла нет', async () => {
    const dir = await tmpDir();
    const res = await readOpenWindows(path.join(dir, 'nope.json'));
    expect(res.open).toEqual([]);
    expect(res.error).toMatch(/VS Code/);
  });

  it('сообщает об ошибке при битом JSON', async () => {
    const dir = await tmpDir();
    await writeFiles(dir, { 'storage.json': '{oops' });
    expect((await readOpenWindows(path.join(dir, 'storage.json'))).error).toBeDefined();
  });
});
```

- [ ] **Step 8: Запустить — должен упасть**

Run: `npx vitest run tests/core/vscode-windows.test.ts`
Expected: FAIL — не найден модуль `vscode-windows`.

- [ ] **Step 9: Создать `src/core/vscode-windows.ts`**

```ts
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VsCodeWindows {
  open: string[];
  active: string | null;
  error?: string;
}

interface RawWindow {
  folder?: unknown;
  workspace?: { configPath?: unknown };
}

export function normalizeWinPath(p: string): string {
  const n = path.win32.normalize(p);
  return /^[a-z]:/.test(n) ? n[0].toUpperCase() + n.slice(1) : n;
}

export function fileUriToPath(uri: string): string | null {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return null;
  try {
    return normalizeWinPath(fileURLToPath(uri, { windows: true }));
  } catch {
    return null;
  }
}

// .code-workspace — это JSONC: убираем строки-комментарии и висячие запятые.
function stripJsonc(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
}

async function workspaceFolders(configUri: string): Promise<string[]> {
  const file = fileUriToPath(configUri);
  if (!file) return [];
  try {
    const json = JSON.parse(stripJsonc(await readFile(file, 'utf8')));
    const dir = path.win32.dirname(file);
    const folders: Array<{ path?: unknown; uri?: unknown }> = Array.isArray(json.folders) ? json.folders : [];
    return folders
      .map((f) =>
        typeof f.path === 'string'
          ? normalizeWinPath(path.win32.resolve(dir, f.path))
          : typeof f.uri === 'string'
            ? fileUriToPath(f.uri)
            : null,
      )
      .filter((p): p is string => p !== null);
  } catch {
    return [];
  }
}

async function windowFolders(w: RawWindow): Promise<string[]> {
  if (typeof w.folder === 'string') {
    const p = fileUriToPath(w.folder);
    return p ? [p] : [];
  }
  if (w.workspace && typeof w.workspace.configPath === 'string') {
    return workspaceFolders(w.workspace.configPath);
  }
  return [];
}

export async function readOpenWindows(storagePath: string): Promise<VsCodeWindows> {
  let state: { openedWindows?: unknown; lastActiveWindow?: unknown };
  try {
    state = JSON.parse(await readFile(storagePath, 'utf8'))?.windowsState ?? {};
  } catch {
    return { open: [], active: null, error: `Не удалось прочитать список окон VS Code (${storagePath})` };
  }
  const windows = Array.isArray(state.openedWindows) ? (state.openedWindows as RawWindow[]) : [];
  const last = (state.lastActiveWindow ?? null) as RawWindow | null;
  const seen = new Set<string>();
  const open: string[] = [];
  for (const w of last ? [...windows, last] : windows) {
    for (const p of await windowFolders(w)) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        open.push(p);
      }
    }
  }
  const active = last ? ((await windowFolders(last))[0] ?? null) : null;
  return { open, active };
}

// storage.json хранит окна и после закрытия VS Code (для восстановления сессии),
// поэтому «открыто» имеет смысл, только если процесс Code.exe запущен.
export function isVsCodeRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', 'IMAGENAME eq Code.exe', '/NH'],
      { windowsHide: true },
      (err, stdout) => resolve(!err && /Code\.exe/i.test(String(stdout))),
    );
  });
}
```

- [ ] **Step 10: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (8 тестов).

- [ ] **Step 11: Commit**

```powershell
git add src/core tests
git commit -m "feat(core): app paths and VS Code open windows reader`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Проекты — открытые, недавние, ручные

**Files:**
- Create: `src/core/projects.ts`
- Test: `tests/core/projects.test.ts`

**Interfaces:**
- Consumes: `AppPaths` (Task 3), `readOpenWindows`, `isVsCodeRunning`, `VsCodeWindows` (Task 3), `Project` (types).
- Produces:
  - `interface Settings { recent: string[]; manual: string[] }`
  - `loadSettings(userDir): Promise<Settings>`, `saveSettings(userDir, s): Promise<void>`
  - `rememberOpen(s: Settings, open: string[]): Settings`
  - `mergeProjects(win: VsCodeWindows, s: Settings): Project[]`
  - `interface ProjectsResult { projects: Project[]; error?: string }`
  - `listProjects(paths, running?: () => Promise<boolean>): Promise<ProjectsResult>`
  - `addManualProject(paths, projectPath): Promise<string>` — возвращает сохранённый (resolved) путь
  - `isKnownProject(paths, projectPath, running?): Promise<boolean>`

- [ ] **Step 1: Написать падающий тест `tests/core/projects.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  addManualProject,
  isKnownProject,
  listProjects,
  loadSettings,
  mergeProjects,
  rememberOpen,
} from '../../src/core/projects';
import type { AppPaths } from '../../src/core/paths';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const running = async () => true;
const stopped = async () => false;

async function setup() {
  const root = await tmpDir();
  const paths: AppPaths = {
    baseCatalogDir: path.join(root, 'catalog'),
    userDir: path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage: path.join(root, 'storage.json'),
  };
  await writeFiles(root, {
    'storage.json': JSON.stringify({
      windowsState: {
        lastActiveWindow: { folder: 'file:///c%3A/work/a' },
        openedWindows: [{ folder: 'file:///c%3A/work/a' }],
      },
    }),
  });
  return { root, paths };
}

describe('mergeProjects', () => {
  it('активный первым, затем открытые, недавние и ручные без дублей', () => {
    const res = mergeProjects(
      { open: ['C:\\a', 'C:\\b'], active: 'C:\\b' },
      { recent: ['c:\\A', 'C:\\old'], manual: ['C:\\man', 'C:\\old'] },
    );
    expect(res).toEqual([
      { path: 'C:\\b', name: 'b', open: true, active: true },
      { path: 'C:\\a', name: 'a', open: true, active: false },
      { path: 'C:\\old', name: 'old', open: false, active: false },
      { path: 'C:\\man', name: 'man', open: false, active: false },
    ]);
  });
});

describe('rememberOpen', () => {
  it('ставит открытые в начало недавних и ограничивает список 20', () => {
    const recent = Array.from({ length: 25 }, (_, i) => `C:\\p${i}`);
    const res = rememberOpen({ recent, manual: [] }, ['C:\\new', 'C:\\p3']);
    expect(res.recent.slice(0, 3)).toEqual(['C:\\new', 'C:\\p3', 'C:\\p0']);
    expect(res.recent).toHaveLength(20);
  });
});

describe('listProjects', () => {
  it('показывает открытые и запоминает их как недавние', async () => {
    const { paths } = await setup();
    const res = await listProjects(paths, running);
    expect(res.projects).toEqual([{ path: 'C:\\work\\a', name: 'a', open: true, active: true }]);
    expect((await loadSettings(paths.userDir)).recent).toEqual(['C:\\work\\a']);
  });

  it('если VS Code не запущен, проекты становятся недавними', async () => {
    const { paths } = await setup();
    await listProjects(paths, running);
    const res = await listProjects(paths, stopped);
    expect(res.projects).toEqual([{ path: 'C:\\work\\a', name: 'a', open: false, active: false }]);
  });
});

describe('addManualProject / isKnownProject', () => {
  it('добавляет существующую папку и признаёт её известной', async () => {
    const { root, paths } = await setup();
    const proj = path.join(root, 'manual-proj');
    await writeFiles(proj, { 'readme.txt': 'x' });
    expect(await addManualProject(paths, proj)).toBe(proj);
    expect(await isKnownProject(paths, proj, running)).toBe(true);
    expect(await isKnownProject(paths, path.join(root, 'other'), running)).toBe(false);
  });

  it('отклоняет несуществующую папку', async () => {
    const { root, paths } = await setup();
    await expect(addManualProject(paths, path.join(root, 'nope'))).rejects.toThrow(/не найдена/);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/projects.test.ts`
Expected: FAIL — не найден модуль `projects`.

- [ ] **Step 3: Создать `src/core/projects.ts`**

```ts
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppPaths } from './paths';
import type { Project } from './types';
import { isVsCodeRunning, readOpenWindows, type VsCodeWindows } from './vscode-windows';

export interface Settings {
  recent: string[];
  manual: string[];
}

export interface ProjectsResult {
  projects: Project[];
  error?: string;
}

const MAX_RECENT = 20;
const SETTINGS_FILE = 'settings.json';
const key = (p: string) => p.toLowerCase();

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function loadSettings(userDir: string): Promise<Settings> {
  try {
    const json = JSON.parse(await readFile(path.join(userDir, SETTINGS_FILE), 'utf8'));
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { recent: list(json.recent), manual: list(json.manual) };
  } catch {
    return { recent: [], manual: [] };
  }
}

export async function saveSettings(userDir: string, s: Settings): Promise<void> {
  await mkdir(userDir, { recursive: true });
  await writeFile(path.join(userDir, SETTINGS_FILE), JSON.stringify(s, null, 2) + '\n', 'utf8');
}

export function rememberOpen(s: Settings, open: string[]): Settings {
  return { ...s, recent: uniq([...open, ...s.recent]).slice(0, MAX_RECENT) };
}

export function mergeProjects(win: VsCodeWindows, s: Settings): Project[] {
  const activeKey = win.active ? key(win.active) : null;
  const openKeys = new Set(win.open.map(key));
  const openSorted = [...win.open].sort(
    (a, b) => Number(key(b) === activeKey) - Number(key(a) === activeKey),
  );
  return uniq([...openSorted, ...s.recent, ...s.manual]).map((p) => ({
    path: p,
    name: path.win32.basename(p) || p,
    open: openKeys.has(key(p)),
    active: key(p) === activeKey,
  }));
}

export async function listProjects(
  paths: AppPaths,
  running: () => Promise<boolean> = isVsCodeRunning,
): Promise<ProjectsResult> {
  const raw = await readOpenWindows(paths.vscodeStorage);
  const win: VsCodeWindows = (await running()) ? raw : { open: [], active: null, error: raw.error };
  const settings = await loadSettings(paths.userDir);
  const next = rememberOpen(settings, win.open);
  if (next.recent.join('|') !== settings.recent.join('|')) await saveSettings(paths.userDir, next);
  return { projects: mergeProjects(win, next), error: win.error };
}

export async function addManualProject(paths: AppPaths, projectPath: string): Promise<string> {
  const resolved = path.resolve(projectPath.trim());
  const st = await stat(resolved).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`Папка не найдена: ${resolved}`);
  const s = await loadSettings(paths.userDir);
  await saveSettings(paths.userDir, { ...s, manual: uniq([...s.manual, resolved]) });
  return resolved;
}

export async function isKnownProject(
  paths: AppPaths,
  projectPath: string,
  running?: () => Promise<boolean>,
): Promise<boolean> {
  const { projects } = await listProjects(paths, running);
  const target = key(path.resolve(projectPath));
  return projects.some((p) => key(p.path) === target);
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (все тесты Task 3 и 6 новых).

- [ ] **Step 5: Commit**

```powershell
git add src/core/projects.ts tests/core/projects.test.ts
git commit -m "feat(core): merge open, recent and manual projects`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontmatter `SKILL.md` и разбор манифеста

**Files:**
- Create: `src/core/frontmatter.ts`, `src/core/manifest.ts`
- Test: `tests/core/frontmatter.test.ts`, `tests/core/manifest.test.ts`

**Interfaces:**
- Consumes: `Manifest`, `CategoryDef`, `SourceDef`, `SkillDef` (types).
- Produces:
  - `interface Frontmatter { name?: string; description?: string }`, `readFrontmatter(markdown: string): Frontmatter`
  - `class ManifestError extends Error`, `emptyManifest(): Manifest`, `parseManifest(raw: string, label: string): Manifest` — бросает `ManifestError` с сообщением, начинающимся с `${label}: `.

- [ ] **Step 1: Написать падающий тест `tests/core/frontmatter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { readFrontmatter } from '../../src/core/frontmatter';

describe('readFrontmatter', () => {
  it('читает name и description', () => {
    expect(readFrontmatter('---\nname: Палитра\ndescription: Подбор цветов\n---\n# x')).toEqual({
      name: 'Палитра',
      description: 'Подбор цветов',
    });
  });

  it('поддерживает многострочное описание и CRLF', () => {
    expect(
      readFrontmatter('---\r\nname: a\r\ndescription: >\r\n  line one\r\n  line two\r\n---\r\n'),
    ).toEqual({ name: 'a', description: 'line one line two' });
  });

  it('без frontmatter — пусто', () => {
    expect(readFrontmatter('# title')).toEqual({});
  });

  it('битый YAML — пусто', () => {
    expect(readFrontmatter('---\nname: [oops\n---\n')).toEqual({});
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/frontmatter.test.ts`
Expected: FAIL — не найден модуль `frontmatter`.

- [ ] **Step 3: Создать `src/core/frontmatter.ts`**

```ts
import { parse } from 'yaml';

export interface Frontmatter {
  name?: string;
  description?: string;
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function readFrontmatter(markdown: string): Frontmatter {
  const match = FRONTMATTER.exec(markdown);
  if (!match) return {};
  try {
    const data: unknown = parse(match[1]);
    if (!data || typeof data !== 'object') return {};
    const record = data as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    return { name: str(record.name), description: str(record.description) };
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run tests/core/frontmatter.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Написать падающий тест `tests/core/manifest.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { emptyManifest, ManifestError, parseManifest } from '../../src/core/manifest';

const valid = {
  version: 1,
  categories: [{ id: 'graphics', title: 'Графика', order: 1 }],
  sources: [
    { id: 's', type: 'local', path: './s' },
    { id: 'g', type: 'git', url: 'https://github.com/o/r', ref: 'main' },
  ],
  skills: [{ id: 'a', source: 's', path: 'a', category: 'graphics' }],
};

describe('parseManifest', () => {
  it('разбирает корректный манифест', () => {
    const m = parseManifest(JSON.stringify(valid), 'T');
    expect(m.skills[0]).toMatchObject({ id: 'a', source: 's', path: 'a', category: 'graphics' });
    expect(m.sources[1]).toEqual({ id: 'g', type: 'git', url: 'https://github.com/o/r', ref: 'main' });
    expect(m.categories[0]).toMatchObject({ id: 'graphics', title: 'Графика', order: 1 });
  });

  it('отсутствующие массивы считаются пустыми', () => {
    expect(parseManifest('{"version":1}', 'T')).toEqual(emptyManifest());
  });

  it.each([
    ['битый JSON', '{', /некорректный JSON/],
    ['версия', JSON.stringify({ ...valid, version: 2 }), /version/],
    ['тип источника', JSON.stringify({ ...valid, sources: [{ id: 's', type: 'ftp' }] }), /type/],
    [
      'неизвестный источник',
      JSON.stringify({ ...valid, skills: [{ id: 'a', source: 'zzz', path: 'a', category: 'graphics' }] }),
      /не найден/,
    ],
    [
      'id с путём',
      JSON.stringify({ ...valid, skills: [{ id: '../evil', source: 's', path: 'a', category: 'graphics' }] }),
      /id/,
    ],
    ['дубликат id', JSON.stringify({ ...valid, skills: [valid.skills[0], valid.skills[0]] }), /повторяется/],
  ])('отклоняет: %s', (_name, raw, re) => {
    expect(() => parseManifest(raw, 'T')).toThrow(ManifestError);
    expect(() => parseManifest(raw, 'T')).toThrow(re);
  });
});
```

- [ ] **Step 6: Запустить — должен упасть**

Run: `npx vitest run tests/core/manifest.test.ts`
Expected: FAIL — не найден модуль `manifest`.

- [ ] **Step 7: Создать `src/core/manifest.ts`**

```ts
import type { CategoryDef, Manifest, SkillDef, SourceDef } from './types';

export class ManifestError extends Error {}

const ID = /^[a-z0-9][a-z0-9._-]*$/i;

type Raw = Record<string, unknown>;

export function emptyManifest(): Manifest {
  return { version: 1, categories: [], sources: [], skills: [] };
}

export function parseManifest(raw: string, label: string): Manifest {
  const fail = (msg: string): never => {
    throw new ManifestError(`${label}: ${msg}`);
  };

  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (e) {
    return fail(`некорректный JSON (${(e as Error).message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('ожидается объект');
  const root = data as Raw;
  if (root.version !== 1) fail('поддерживается только "version": 1');

  const arr = (name: string): Raw[] => {
    const v = root[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) return fail(`"${name}" должен быть массивом`);
    return v.map((x) => (x && typeof x === 'object' ? (x as Raw) : {}));
  };
  const id = (v: unknown, where: string): string =>
    typeof v === 'string' && ID.test(v) ? v : fail(`${where}.id некорректен`);
  const str = (v: unknown, where: string): string =>
    typeof v === 'string' && v.trim() ? v : fail(`${where} обязателен`);
  const optStr = (v: unknown, where: string): string | undefined =>
    v === undefined ? undefined : typeof v === 'string' ? v : fail(`${where} должен быть строкой`);

  const categories: CategoryDef[] = arr('categories').map((c, i) => ({
    id: id(c.id, `categories[${i}]`),
    title: str(c.title, `categories[${i}].title`),
    order: typeof c.order === 'number' ? c.order : undefined,
  }));

  const sources: SourceDef[] = arr('sources').map((s, i): SourceDef => {
    const where = `sources[${i}]`;
    if (s.type === 'local') return { id: id(s.id, where), type: 'local', path: str(s.path, `${where}.path`) };
    if (s.type === 'git') {
      const ref = optStr(s.ref, `${where}.ref`);
      return { id: id(s.id, where), type: 'git', url: str(s.url, `${where}.url`), ...(ref ? { ref } : {}) };
    }
    return fail(`${where}.type должен быть "local" или "git"`);
  });
  const sourceIds = new Set(sources.map((s) => s.id));

  const seen = new Set<string>();
  const skills: SkillDef[] = arr('skills').map((k, i) => {
    const where = `skills[${i}]`;
    const skillId = id(k.id, where);
    if (seen.has(skillId)) fail(`id "${skillId}" повторяется`);
    seen.add(skillId);
    const source = str(k.source, `${where}.source`);
    if (!sourceIds.has(source)) fail(`${where}.source "${source}" не найден в sources`);
    return {
      id: skillId,
      source,
      path: typeof k.path === 'string' ? k.path : '',
      category: str(k.category, `${where}.category`),
      title: optStr(k.title, `${where}.title`),
      description: optStr(k.description, `${where}.description`),
    };
  });

  return { version: 1, categories, sources, skills };
}
```

- [ ] **Step 8: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (все тесты, включая 8 новых в `manifest.test.ts` и 4 в `frontmatter.test.ts`).

- [ ] **Step 9: Commit**

```powershell
git add src/core/frontmatter.ts src/core/manifest.ts tests/core/frontmatter.test.ts tests/core/manifest.test.ts
git commit -m "feat(core): SKILL.md frontmatter and catalog manifest parser`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Источники — локальная папка и git

**Files:**
- Create: `src/core/sources.ts`
- Test: `tests/core/sources.test.ts`

**Interfaces:**
- Consumes: `Layer`, `SourceDef` (types).
- Produces:
  - `type GitRunner = (args: string[], cwd?: string) => Promise<void>`, `runGit: GitRunner`
  - `sourceCacheDir(cacheDir: string, layer: Layer, id: string): string` → `<cacheDir>/<layer>-<id>`
  - `ensureSource(src: SourceDef, opts: { layer: Layer; manifestDir: string; cacheDir: string; update: boolean }, git?: GitRunner): Promise<string>` — возвращает папку источника.

- [ ] **Step 1: Написать падающий тест `tests/core/sources.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureSource, runGit, sourceCacheDir } from '../../src/core/sources';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const GIT_ID = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false'];

async function makeRepo(root: string): Promise<string> {
  const origin = path.join(root, 'origin');
  await writeFiles(origin, { 'skills/demo/SKILL.md': '---\nname: Demo\n---\nv1' });
  await runGit(['init', '-b', 'main'], origin);
  await runGit(['add', '.'], origin);
  await runGit([...GIT_ID, 'commit', '-m', 'v1'], origin);
  return origin;
}

describe('ensureSource', () => {
  it('local: путь относительно манифеста', async () => {
    const root = await tmpDir();
    await writeFiles(root, { 'cat/samples/x.txt': '1' });
    const dir = await ensureSource(
      { id: 's', type: 'local', path: './samples' },
      { layer: 'base', manifestDir: path.join(root, 'cat'), cacheDir: path.join(root, '.cache'), update: false },
    );
    expect(dir).toBe(path.join(root, 'cat', 'samples'));
  });

  it('local: ошибка, если папки нет', async () => {
    const root = await tmpDir();
    await expect(
      ensureSource(
        { id: 's', type: 'local', path: './nope' },
        { layer: 'base', manifestDir: root, cacheDir: root, update: false },
      ),
    ).rejects.toThrow(/не найдена/);
  });

  it('git: клонирует, а новые коммиты подтягивает только при update', async () => {
    const root = await tmpDir();
    const origin = await makeRepo(root);
    const cacheDir = path.join(root, '.cache');
    const src = { id: 'demo', type: 'git' as const, url: pathToFileURL(origin).href, ref: 'main' };
    const opts = { layer: 'user' as const, manifestDir: root, cacheDir };
    const file = (dir: string) => readFile(path.join(dir, 'skills', 'demo', 'SKILL.md'), 'utf8');

    const dir = await ensureSource(src, { ...opts, update: false });
    expect(dir).toBe(sourceCacheDir(cacheDir, 'user', 'demo'));
    expect(await file(dir)).toContain('v1');

    await writeFiles(origin, { 'skills/demo/SKILL.md': '---\nname: Demo\n---\nv2' });
    await runGit([...GIT_ID, 'commit', '-am', 'v2'], origin);

    await ensureSource(src, { ...opts, update: false });
    expect(await file(dir)).toContain('v1');

    await ensureSource(src, { ...opts, update: true });
    expect(await file(dir)).toContain('v2');
  });

  it('git: ошибка клонирования пробрасывается', async () => {
    const root = await tmpDir();
    await expect(
      ensureSource(
        { id: 'bad', type: 'git', url: pathToFileURL(path.join(root, 'missing')).href },
        { layer: 'base', manifestDir: root, cacheDir: path.join(root, '.cache'), update: false },
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/sources.test.ts`
Expected: FAIL — не найден модуль `sources`.

- [ ] **Step 3: Создать `src/core/sources.ts`**

```ts
import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Layer, SourceDef } from './types';

export type GitRunner = (args: string[], cwd?: string) => Promise<void>;

export const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 120_000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(String(stderr).trim() || err.message));
      else resolve();
    });
  });

const exists = (p: string) => access(p).then(() => true, () => false);

export function sourceCacheDir(cacheDir: string, layer: Layer, id: string): string {
  return path.join(cacheDir, `${layer}-${id}`);
}

export async function ensureSource(
  src: SourceDef,
  opts: { layer: Layer; manifestDir: string; cacheDir: string; update: boolean },
  git: GitRunner = runGit,
): Promise<string> {
  if (src.type === 'local') {
    const dir = path.resolve(opts.manifestDir, src.path);
    if (!(await exists(dir))) throw new Error(`Папка источника не найдена: ${dir}`);
    return dir;
  }

  const dir = sourceCacheDir(opts.cacheDir, opts.layer, src.id);
  if (await exists(path.join(dir, '.git'))) {
    if (opts.update) await git(['pull', '--ff-only'], dir);
    return dir;
  }

  await rm(dir, { recursive: true, force: true });
  await mkdir(opts.cacheDir, { recursive: true });
  const args = ['clone', '--depth', '1'];
  if (src.ref) args.push('--branch', src.ref);
  args.push(src.url, dir);
  await git(args);
  return dir;
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run tests/core/sources.test.ts`
Expected: PASS (4 теста). Если `git commit` падает из-за глобальных хуков пользователя — добавить в `GIT_ID` `'-c', 'core.hooksPath=NUL'` и повторить.

- [ ] **Step 5: Commit**

```powershell
git add src/core/sources.ts tests/core/sources.test.ts
git commit -m "feat(core): local and git catalog sources`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Загрузка каталога из двух слоёв

**Files:**
- Create: `src/core/catalog.ts`
- Test: `tests/core/catalog.test.ts`

**Interfaces:**
- Consumes: `AppPaths`, `BASE_MANIFEST`, `USER_MANIFEST` (Task 3); `parseManifest`, `emptyManifest` (Task 5); `readFrontmatter` (Task 5); `ensureSource`, `runGit`, `GitRunner` (Task 6).
- Produces:
  - `class CatalogError extends Error` — базовый каталог отсутствует или битый;
  - `mergeCategories(base, user, skills): CategoryDef[]`;
  - `loadCatalog(paths: AppPaths, opts?: { update?: boolean }, git?: GitRunner): Promise<Catalog>`.

- [ ] **Step 1: Написать падающий тест `tests/core/catalog.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { CatalogError, loadCatalog } from '../../src/core/catalog';
import type { AppPaths } from '../../src/core/paths';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const skillMd = (name: string) => `---\nname: ${name}\ndescription: описание\n---\n`;

const base = {
  version: 1,
  categories: [
    { id: 'video', title: 'Видео', order: 2 },
    { id: 'graphics', title: 'Графика', order: 1 },
  ],
  sources: [{ id: 'samples', type: 'local', path: './samples' }],
  skills: [
    { id: 'palette', source: 'samples', path: 'palette', category: 'graphics' },
    { id: 'icons', source: 'samples', path: 'icons', category: 'graphics', title: 'Свои иконки' },
  ],
};

async function setup(baseManifest: object, user?: object | string, extra: Record<string, string> = {}) {
  const root = await tmpDir();
  const paths: AppPaths = {
    baseCatalogDir: path.join(root, 'catalog'),
    userDir: path.join(root, 'user'),
    cacheDir: path.join(root, '.cache'),
    vscodeStorage: path.join(root, 'storage.json'),
  };
  await writeFiles(root, {
    'catalog/catalog.json': JSON.stringify(baseManifest),
    'catalog/samples/palette/SKILL.md': skillMd('Палитра'),
    'catalog/samples/icons/SKILL.md': skillMd('Иконки'),
    ...(user === undefined
      ? {}
      : { 'user/user-catalog.json': typeof user === 'string' ? user : JSON.stringify(user) }),
    ...extra,
  });
  return { root, paths };
}

describe('loadCatalog', () => {
  it('базовый слой: название из SKILL.md, переопределение из манифеста, порядок категорий', async () => {
    const { root, paths } = await setup(base);
    const c = await loadCatalog(paths);
    expect(c.categories.map((x) => x.id)).toEqual(['graphics', 'video']);
    expect(c.skills).toEqual([
      {
        id: 'palette', title: 'Палитра', description: 'описание', category: 'graphics',
        layer: 'base', dir: path.join(root, 'catalog', 'samples', 'palette'),
      },
      {
        id: 'icons', title: 'Свои иконки', description: 'описание', category: 'graphics',
        layer: 'base', dir: path.join(root, 'catalog', 'samples', 'icons'),
      },
    ]);
    expect(c.errors).toEqual([]);
  });

  it('пользовательский слой перекрывает базовый по id и добавляет категории', async () => {
    const { paths } = await setup(
      base,
      {
        version: 1,
        categories: [{ id: 'mine', title: 'Моё' }],
        sources: [{ id: 'local', type: 'local', path: './skills' }],
        skills: [{ id: 'palette', source: 'local', path: 'palette2', category: 'mine' }],
      },
      { 'user/skills/palette2/SKILL.md': skillMd('Моя палитра') },
    );
    const c = await loadCatalog(paths);
    expect(c.skills.find((s) => s.id === 'palette')).toMatchObject({
      layer: 'user', title: 'Моя палитра', category: 'mine',
    });
    expect(c.categories.map((x) => x.id)).toContain('mine');
    expect(c.skills).toHaveLength(2);
  });

  it('битый пользовательский файл не ломает базовый слой', async () => {
    const { paths } = await setup(base, '{oops');
    const c = await loadCatalog(paths);
    expect(c.skills).toHaveLength(2);
    expect(c.errors[0]).toMatch(/Мой каталог/);
  });

  it('нет базового каталога — CatalogError', async () => {
    const root = await tmpDir();
    await expect(
      loadCatalog({ baseCatalogDir: path.join(root, 'none'), userDir: root, cacheDir: root, vscodeStorage: '' }),
    ).rejects.toBeInstanceOf(CatalogError);
  });

  it('помечает скилл без SKILL.md и путь за пределами источника', async () => {
    const { paths } = await setup({
      ...base,
      skills: [
        { id: 'ghost', source: 'samples', path: 'ghost', category: 'graphics' },
        { id: 'evil', source: 'samples', path: '../../..', category: 'graphics' },
      ],
    });
    const c = await loadCatalog(paths);
    expect(c.skills.find((s) => s.id === 'ghost')).toMatchObject({ dir: null, error: 'SKILL.md не найден' });
    expect(c.skills.find((s) => s.id === 'evil')).toMatchObject({
      dir: null, error: expect.stringMatching(/за пределы/),
    });
  });

  it('ошибка git-источника помечает его скиллы, остальные работают', async () => {
    const { paths } = await setup({
      ...base,
      sources: [...base.sources, { id: 'remote', type: 'git', url: 'https://example.invalid/r.git' }],
      skills: [...base.skills, { id: 'far', source: 'remote', path: '', category: 'video' }],
    });
    const failingGit = async () => {
      throw new Error('сеть недоступна');
    };
    const c = await loadCatalog(paths, {}, failingGit);
    expect(c.skills.find((s) => s.id === 'far')).toMatchObject({ dir: null, error: 'Источник недоступен' });
    expect(c.skills.find((s) => s.id === 'palette')?.dir).not.toBeNull();
    expect(c.errors[0]).toMatch(/remote.*сеть недоступна/);
  });

  it('неизвестная категория скилла добавляется автоматически', async () => {
    const { paths } = await setup({
      ...base,
      skills: [{ id: 'palette', source: 'samples', path: 'palette', category: 'misc' }],
    });
    expect((await loadCatalog(paths)).categories.map((c) => c.id)).toContain('misc');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/catalog.test.ts`
Expected: FAIL — не найден модуль `catalog`.

- [ ] **Step 3: Создать `src/core/catalog.ts`**

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readFrontmatter } from './frontmatter';
import { emptyManifest, parseManifest } from './manifest';
import { BASE_MANIFEST, USER_MANIFEST, type AppPaths } from './paths';
import { ensureSource, runGit, type GitRunner } from './sources';
import type { Catalog, CatalogSkill, CategoryDef, Layer, Manifest } from './types';

export class CatalogError extends Error {}

const LAYER_LABEL: Record<Layer, string> = { base: 'базовый', user: 'мой' };

async function readManifestFile(file: string, label: string): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  return parseManifest(raw, label);
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function resolveLayer(
  layer: Layer,
  manifest: Manifest,
  manifestDir: string,
  cacheDir: string,
  update: boolean,
  git: GitRunner,
  errors: string[],
): Promise<CatalogSkill[]> {
  const sourceDirs = new Map<string, string | null>();
  for (const src of manifest.sources) {
    try {
      sourceDirs.set(src.id, await ensureSource(src, { layer, manifestDir, cacheDir, update }, git));
    } catch (e) {
      sourceDirs.set(src.id, null);
      errors.push(`Источник «${src.id}» (${LAYER_LABEL[layer]}): ${(e as Error).message}`);
    }
  }

  const skills: CatalogSkill[] = [];
  for (const def of manifest.skills) {
    const base = {
      id: def.id,
      category: def.category,
      layer,
      title: def.title ?? def.id,
      description: def.description ?? '',
    };
    const srcDir = sourceDirs.get(def.source) ?? null;
    if (!srcDir) {
      skills.push({ ...base, dir: null, error: 'Источник недоступен' });
      continue;
    }
    const dir = path.resolve(srcDir, def.path);
    if (!isInside(srcDir, dir)) {
      skills.push({ ...base, dir: null, error: 'Путь скилла выходит за пределы источника' });
      continue;
    }
    let md: string;
    try {
      md = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
    } catch {
      skills.push({ ...base, dir: null, error: 'SKILL.md не найден' });
      continue;
    }
    const fm = readFrontmatter(md);
    skills.push({
      ...base,
      dir,
      title: def.title ?? fm.name ?? def.id,
      description: def.description ?? fm.description ?? '',
    });
  }
  return skills;
}

export function mergeCategories(
  base: CategoryDef[],
  user: CategoryDef[],
  skills: CatalogSkill[],
): CategoryDef[] {
  const map = new Map<string, CategoryDef>();
  for (const c of [...base, ...user]) map.set(c.id, c);
  for (const s of skills) if (!map.has(s.category)) map.set(s.category, { id: s.category, title: s.category });
  return [...map.values()].sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.title.localeCompare(b.title, 'ru'),
  );
}

export async function loadCatalog(
  paths: AppPaths,
  opts: { update?: boolean } = {},
  git: GitRunner = runGit,
): Promise<Catalog> {
  const errors: string[] = [];
  const update = opts.update ?? false;

  const baseFile = path.join(paths.baseCatalogDir, BASE_MANIFEST);
  let base: Manifest | null;
  try {
    base = await readManifestFile(baseFile, 'Базовый каталог');
  } catch (e) {
    throw new CatalogError((e as Error).message);
  }
  if (!base) throw new CatalogError(`Базовый каталог не найден: ${baseFile}`);

  let user = emptyManifest();
  try {
    user = (await readManifestFile(path.join(paths.userDir, USER_MANIFEST), 'Мой каталог')) ?? user;
  } catch (e) {
    errors.push((e as Error).message);
  }

  const baseSkills = await resolveLayer('base', base, paths.baseCatalogDir, paths.cacheDir, update, git, errors);
  const userSkills = await resolveLayer('user', user, paths.userDir, paths.cacheDir, update, git, errors);

  const byId = new Map<string, CatalogSkill>();
  for (const s of [...baseSkills, ...userSkills]) byId.set(s.id, s);
  const skills = [...byId.values()];

  return { categories: mergeCategories(base.categories, user.categories, skills), skills, errors };
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (все тесты, 7 новых).

- [ ] **Step 5: Commit**

```powershell
git add src/core/catalog.ts tests/core/catalog.test.ts
git commit -m "feat(core): load and merge base and user catalog layers`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Хеш папки и установщик

**Files:**
- Create: `src/core/hash.ts`, `src/core/installer.ts`
- Test: `tests/core/installer.test.ts`

**Interfaces:**
- Consumes: `CatalogSkill`, `InstallResult`, `InstalledState` (types).
- Produces:
  - `hashDir(dir: string): Promise<string>` — SHA-256 по отсортированным путям и байтам, без `.git`;
  - `skillsDir(projectPath): string`, `skillTargetDir(projectPath, skillId): string` — бросает на недопустимый id;
  - `installSkills(projectPath, catalog: CatalogSkill[], ids: string[], opts?: { overwrite?: boolean }): Promise<InstallResult[]>`;
  - `getInstalled(projectPath, catalog: CatalogSkill[]): Promise<InstalledState>`.

- [ ] **Step 1: Написать падающий тест `tests/core/installer.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getInstalled, installSkills, skillTargetDir } from '../../src/core/installer';
import type { CatalogSkill } from '../../src/core/types';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const exists = (p: string) => access(p).then(() => true, () => false);

async function setup() {
  const root = await tmpDir();
  await writeFiles(root, {
    'lib/a/SKILL.md': '---\nname: A\n---\n',
    'lib/a/ref/notes.md': 'n',
    'lib/b/SKILL.md': '---\nname: B\n---\n',
    'project/readme.txt': 'x',
  });
  const skill = (id: string): CatalogSkill => ({
    id, title: id.toUpperCase(), description: '', category: 'graphics', layer: 'base',
    dir: path.join(root, 'lib', id),
  });
  const catalog: CatalogSkill[] = [
    skill('a'),
    skill('b'),
    {
      id: 'broken', title: 'X', description: '', category: 'graphics', layer: 'base',
      dir: null, error: 'SKILL.md не найден',
    },
  ];
  return { root, project: path.join(root, 'project'), catalog };
}

describe('skillTargetDir', () => {
  it('строит путь внутри .claude/skills', () => {
    expect(skillTargetDir('C:\\p', 'a')).toBe(path.join('C:\\p', '.claude', 'skills', 'a'));
  });

  it.each(['..', '../x', 'a/b', 'a\\b', ''])('отклоняет id «%s»', (id) => {
    expect(() => skillTargetDir('C:\\p', id)).toThrow();
  });
});

describe('installSkills', () => {
  it('копирует скиллы со вложенными файлами', async () => {
    const { project, catalog } = await setup();
    expect(await installSkills(project, catalog, ['a', 'b'])).toEqual([
      { skillId: 'a', status: 'installed' },
      { skillId: 'b', status: 'installed' },
    ]);
    expect(await readFile(path.join(project, '.claude', 'skills', 'a', 'ref', 'notes.md'), 'utf8')).toBe('n');
  });

  it('без overwrite не перезаписывает, с overwrite заменяет целиком', async () => {
    const { project, catalog } = await setup();
    await installSkills(project, catalog, ['a']);
    const extra = path.join(project, '.claude', 'skills', 'a', 'extra.txt');
    await writeFile(extra, 'old');
    expect(await installSkills(project, catalog, ['a'])).toEqual([{ skillId: 'a', status: 'already-installed' }]);
    expect(await installSkills(project, catalog, ['a'], { overwrite: true })).toEqual([
      { skillId: 'a', status: 'installed' },
    ]);
    expect(await exists(extra)).toBe(false);
  });

  it('ошибка одного скилла не мешает остальным', async () => {
    const { project, catalog } = await setup();
    expect(await installSkills(project, catalog, ['nope', 'broken', 'b'])).toEqual([
      { skillId: 'nope', status: 'error', message: 'Скилл не найден в каталоге' },
      { skillId: 'broken', status: 'error', message: 'SKILL.md не найден' },
      { skillId: 'b', status: 'installed' },
    ]);
  });
});

describe('getInstalled', () => {
  it('нет .claude — пусто', async () => {
    const { project, catalog } = await setup();
    expect(await getInstalled(project, catalog)).toEqual({});
  });

  it('up-to-date, outdated и unknown', async () => {
    const { root, project, catalog } = await setup();
    await installSkills(project, catalog, ['a', 'b']);
    await writeFiles(project, {
      '.claude/skills/foreign/SKILL.md': 'x',
      '.claude/skills/not-a-skill/readme.txt': 'x',
    });
    await writeFile(path.join(root, 'lib', 'b', 'SKILL.md'), '---\nname: B\n---\nновая версия');
    expect(await getInstalled(project, catalog)).toEqual({ a: 'up-to-date', b: 'outdated', foreign: 'unknown' });
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/installer.test.ts`
Expected: FAIL — не найден модуль `installer`.

- [ ] **Step 3: Создать `src/core/hash.ts`**

```ts
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['.git']);

async function listFiles(root: string, rel = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(root, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export async function hashDir(dir: string): Promise<string> {
  const files = (await listFiles(dir)).sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update('\0');
    h.update(await readFile(path.join(dir, f)));
    h.update('\0');
  }
  return h.digest('hex');
}
```

- [ ] **Step 4: Создать `src/core/installer.ts`**

```ts
import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { hashDir } from './hash';
import type { CatalogSkill, InstallResult, InstalledState } from './types';

const exists = (p: string) => access(p).then(() => true, () => false);

export function skillsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'skills');
}

export function skillTargetDir(projectPath: string, skillId: string): string {
  const root = path.resolve(skillsDir(projectPath));
  const target = path.resolve(root, skillId);
  if (path.dirname(target) !== root) throw new Error(`Недопустимый id скилла: ${skillId}`);
  return target;
}

export async function installSkills(
  projectPath: string,
  catalog: CatalogSkill[],
  ids: string[],
  opts: { overwrite?: boolean } = {},
): Promise<InstallResult[]> {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const results: InstallResult[] = [];
  for (const id of ids) {
    try {
      const skill = byId.get(id);
      if (!skill) throw new Error('Скилл не найден в каталоге');
      if (!skill.dir) throw new Error(skill.error ?? 'Скилл недоступен');
      const target = skillTargetDir(projectPath, id);
      if (await exists(target)) {
        if (!opts.overwrite) {
          results.push({ skillId: id, status: 'already-installed' });
          continue;
        }
        await rm(target, { recursive: true, force: true });
      }
      await mkdir(path.dirname(target), { recursive: true });
      await cp(skill.dir, target, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
      results.push({ skillId: id, status: 'installed' });
    } catch (e) {
      results.push({ skillId: id, status: 'error', message: (e as Error).message });
    }
  }
  return results;
}

export async function getInstalled(projectPath: string, catalog: CatalogSkill[]): Promise<InstalledState> {
  const root = skillsDir(projectPath);
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return {};
  }
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const state: InstalledState = {};
  for (const name of names) {
    const dir = path.join(root, name);
    if (!(await exists(path.join(dir, 'SKILL.md')))) continue;
    const skill = byId.get(name);
    if (!skill?.dir) {
      state[name] = 'unknown';
      continue;
    }
    state[name] = (await hashDir(skill.dir)) === (await hashDir(dir)) ? 'up-to-date' : 'outdated';
  }
  return state;
}
```

- [ ] **Step 5: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (все тесты, 11 новых).

- [ ] **Step 6: Commit**

```powershell
git add src/core/hash.ts src/core/installer.ts tests/core/installer.test.ts
git commit -m "feat(core): install skills and detect outdated copies by hash`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Добавление своего скилла в пользовательский слой

**Files:**
- Create: `src/core/user-catalog.ts`
- Test: `tests/core/user-catalog.test.ts`

**Interfaces:**
- Consumes: `USER_MANIFEST` (Task 3), `parseManifest`, `emptyManifest` (Task 5), `Manifest`, `SourceDef` (types).
- Produces:
  - `interface NewUserSkill { kind: 'git' | 'local'; location: string; ref?: string; skillPath?: string; category: string; newCategoryTitle?: string }` — `category: ''` означает «создать новую из `newCategoryTitle`»;
  - `slugify(text: string): string`;
  - `addUserSkill(userDir: string, input: NewUserSkill): Promise<{ skillId: string }>`.

- [ ] **Step 1: Написать падающий тест `tests/core/user-catalog.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseManifest } from '../../src/core/manifest';
import { addUserSkill, slugify } from '../../src/core/user-catalog';
import { cleanupTmp, tmpDir, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const read = async (userDir: string) =>
  parseManifest(await readFile(path.join(userDir, 'user-catalog.json'), 'utf8'), 'T');

describe('slugify', () => {
  it('латиница и цифры', () => expect(slugify('Owner/My_Repo.git')).toBe('owner-my-repo'));
  it('кириллица даёт пустую строку', () => expect(slugify('Мои штуки')).toBe(''));
});

describe('addUserSkill', () => {
  it('создаёт файл с git-источником, скиллом и новой категорией', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const res = await addUserSkill(userDir, {
      kind: 'git', location: 'https://github.com/owner/repo', ref: 'main',
      skillPath: 'skills/cool-skill/', category: '', newCategoryTitle: 'Мои штуки',
    });
    expect(res).toEqual({ skillId: 'cool-skill' });
    const m = await read(userDir);
    expect(m.categories).toEqual([{ id: 'custom', title: 'Мои штуки' }]);
    expect(m.sources).toEqual([{ id: 'owner-repo', type: 'git', url: 'https://github.com/owner/repo', ref: 'main' }]);
    expect(m.skills).toEqual([{ id: 'cool-skill', source: 'owner-repo', path: 'skills/cool-skill', category: 'custom' }]);
  });

  it('переиспользует источник и делает id уникальными', async () => {
    const userDir = path.join(await tmpDir(), 'user');
    const input = { kind: 'git' as const, location: 'https://github.com/owner/repo', skillPath: 'skills/x', category: 'graphics' };
    await addUserSkill(userDir, input);
    expect(await addUserSkill(userDir, input)).toEqual({ skillId: 'x-2' });
    const m = await read(userDir);
    expect(m.sources).toHaveLength(1);
    expect(m.skills.map((s) => s.id)).toEqual(['x', 'x-2']);
  });

  it('локальная папка сохраняется абсолютным путём, id — из имени папки', async () => {
    const root = await tmpDir();
    const userDir = path.join(root, 'user');
    await writeFiles(root, { 'my-skill/SKILL.md': '---\nname: M\n---\n' });
    expect(
      await addUserSkill(userDir, { kind: 'local', location: path.join(root, 'my-skill'), category: 'graphics' }),
    ).toEqual({ skillId: 'my-skill' });
    expect((await read(userDir)).sources[0]).toEqual({
      id: 'my-skill', type: 'local', path: path.join(root, 'my-skill'),
    });
  });

  it.each([
    [{ kind: 'git' as const, location: '  ', category: 'graphics' }, /адрес/],
    [{ kind: 'git' as const, location: 'https://github.com/o/r', category: '' }, /категори/],
  ])('валидирует ввод %#', async (input, re) => {
    await expect(addUserSkill(path.join(await tmpDir(), 'user'), input)).rejects.toThrow(re);
  });

  it('не перезаписывает битый файл', async () => {
    const root = await tmpDir();
    await writeFiles(root, { 'user/user-catalog.json': '{oops' });
    await expect(
      addUserSkill(path.join(root, 'user'), { kind: 'git', location: 'https://github.com/o/r', category: 'g' }),
    ).rejects.toThrow();
    expect(await readFile(path.join(root, 'user', 'user-catalog.json'), 'utf8')).toBe('{oops');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/user-catalog.test.ts`
Expected: FAIL — не найден модуль `user-catalog`.

- [ ] **Step 3: Создать `src/core/user-catalog.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyManifest, parseManifest } from './manifest';
import { USER_MANIFEST } from './paths';
import type { Manifest, SourceDef } from './types';

export interface NewUserSkill {
  kind: 'git' | 'local';
  location: string;
  ref?: string;
  skillPath?: string;
  category: string;
  newCategoryTitle?: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

async function readUserManifest(file: string): Promise<Manifest> {
  try {
    return parseManifest(await readFile(file, 'utf8'), 'Мой каталог');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest();
    throw e;
  }
}

export async function addUserSkill(userDir: string, input: NewUserSkill): Promise<{ skillId: string }> {
  const location = input.location.trim();
  if (!location) throw new Error('Укажите адрес репозитория или папку');
  const ref = input.ref?.trim() ?? '';

  const file = path.join(userDir, USER_MANIFEST);
  const manifest = await readUserManifest(file);

  let category = input.category.trim();
  if (!category) {
    const title = (input.newCategoryTitle ?? '').trim();
    if (!title) throw new Error('Выберите категорию или введите название новой');
    category = uniqueId(slugify(title) || 'custom', new Set(manifest.categories.map((c) => c.id)));
    manifest.categories.push({ id: category, title });
  }

  const localPath = input.kind === 'local' ? path.resolve(location) : '';
  const existing = manifest.sources.find((s) =>
    input.kind === 'git'
      ? s.type === 'git' && s.url === location && (s.ref ?? '') === ref
      : s.type === 'local' && path.resolve(userDir, s.path) === localPath,
  );

  let sourceId: string;
  if (existing) {
    sourceId = existing.id;
  } else {
    const base =
      input.kind === 'git'
        ? slugify(location.replace(/\/+$/, '').split('/').slice(-2).join('-'))
        : slugify(path.basename(localPath));
    sourceId = uniqueId(base || 'source', new Set(manifest.sources.map((s) => s.id)));
    const src: SourceDef =
      input.kind === 'git'
        ? { id: sourceId, type: 'git', url: location, ...(ref ? { ref } : {}) }
        : { id: sourceId, type: 'local', path: localPath };
    manifest.sources.push(src);
  }

  const skillPath = (input.skillPath ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const idBase = slugify(skillPath ? (skillPath.split('/').pop() ?? '') : sourceId) || 'skill';
  const skillId = uniqueId(idBase, new Set(manifest.skills.map((s) => s.id)));
  manifest.skills.push({ id: skillId, source: sourceId, path: skillPath, category });

  await mkdir(userDir, { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { skillId };
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npx vitest run tests/core`
Expected: PASS (все тесты, 8 новых).

- [ ] **Step 5: Commit**

```powershell
git add src/core/user-catalog.ts tests/core/user-catalog.test.ts
git commit -m "feat(core): add custom skills to the user catalog layer`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Логика корзины выбора

**Files:**
- Create: `src/core/selection.ts`
- Test: `tests/core/selection.test.ts`

**Interfaces:**
- Consumes: `CatalogSkill`, `CategoryDef` (types). Только типы — модуль используется на клиенте.
- Produces:
  - `MY_SKILLS = '__my__'` — id виртуальной категории «Мои скиллы»;
  - `toggleSelection(selected: readonly string[], id: string): string[]`;
  - `skillsForCategory(skills, categoryId): CatalogSkill[]`;
  - `countByCategory(selected, skills): Record<string, number>` (включая `MY_SKILLS`);
  - `pruneSelection(selected, skills): string[]` — убирает пропавшие и недоступные;
  - `summarizeByCategory(selected: readonly CatalogSkill[], categories: readonly CategoryDef[]): string` → `"Графика 2 · Видео 1"`.

- [ ] **Step 1: Написать падающий тест `tests/core/selection.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  countByCategory,
  MY_SKILLS,
  pruneSelection,
  skillsForCategory,
  summarizeByCategory,
  toggleSelection,
} from '../../src/core/selection';
import type { CatalogSkill } from '../../src/core/types';

const skills: CatalogSkill[] = [
  { id: 'a', title: 'A', description: '', category: 'graphics', layer: 'base', dir: 'x' },
  { id: 'b', title: 'B', description: '', category: 'video', layer: 'user', dir: 'x' },
  { id: 'c', title: 'C', description: '', category: 'video', layer: 'base', dir: null, error: 'e' },
];
const categories = [
  { id: 'graphics', title: 'Графика' },
  { id: 'video', title: 'Видео' },
];

describe('selection', () => {
  it('toggleSelection добавляет и убирает', () => {
    expect(toggleSelection([], 'a')).toEqual(['a']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('skillsForCategory: обычная категория и «Мои скиллы»', () => {
    expect(skillsForCategory(skills, 'video').map((s) => s.id)).toEqual(['b', 'c']);
    expect(skillsForCategory(skills, MY_SKILLS).map((s) => s.id)).toEqual(['b']);
  });

  it('countByCategory считает категории и «Мои скиллы»', () => {
    expect(countByCategory(['a', 'b'], skills)).toEqual({ graphics: 1, video: 1, [MY_SKILLS]: 1 });
  });

  it('pruneSelection убирает пропавшие и недоступные', () => {
    expect(pruneSelection(['a', 'c', 'zzz'], skills)).toEqual(['a']);
  });

  it('summarizeByCategory в порядке категорий', () => {
    expect(summarizeByCategory([skills[1], skills[0]], categories)).toBe('Графика 1 · Видео 1');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `npx vitest run tests/core/selection.test.ts`
Expected: FAIL — не найден модуль `selection`.

- [ ] **Step 3: Создать `src/core/selection.ts`**

```ts
import type { CatalogSkill, CategoryDef } from './types';

export const MY_SKILLS = '__my__';

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export function skillsForCategory(skills: readonly CatalogSkill[], categoryId: string): CatalogSkill[] {
  return skills.filter((s) => (categoryId === MY_SKILLS ? s.layer === 'user' : s.category === categoryId));
}

export function countByCategory(
  selected: readonly string[],
  skills: readonly CatalogSkill[],
): Record<string, number> {
  const set = new Set(selected);
  const counts: Record<string, number> = {};
  for (const s of skills) {
    if (!set.has(s.id)) continue;
    counts[s.category] = (counts[s.category] ?? 0) + 1;
    if (s.layer === 'user') counts[MY_SKILLS] = (counts[MY_SKILLS] ?? 0) + 1;
  }
  return counts;
}

export function pruneSelection(selected: readonly string[], skills: readonly CatalogSkill[]): string[] {
  const available = new Set(skills.filter((s) => s.dir).map((s) => s.id));
  return selected.filter((id) => available.has(id));
}

export function summarizeByCategory(
  selected: readonly CatalogSkill[],
  categories: readonly CategoryDef[],
): string {
  const counts = new Map<string, number>();
  for (const s of selected) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return categories
    .filter((c) => counts.has(c.id))
    .map((c) => `${c.title} ${counts.get(c.id)}`)
    .join(' · ');
}
```

- [ ] **Step 4: Запустить — должен пройти**

Run: `npm test`
Expected: PASS — все тесты `tests/core`.

- [ ] **Step 5: Commit**

```powershell
git add src/core/selection.ts tests/core/selection.test.ts
git commit -m "feat(core): selection cart helpers`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Тестовый каталог и Server Actions

**Files:**
- Create: `catalog/catalog.json`, `catalog/samples/sample-palette/SKILL.md`, `catalog/samples/sample-icons/SKILL.md`, `catalog/samples/sample-storyboard/SKILL.md`, `catalog/samples/sample-subtitles/SKILL.md`, `src/app/actions.ts`
- Modify: `src/app/page.tsx` (временная проверочная страница; заменяется в Task 14)

**Interfaces:**
- Consumes: всё из `src/core`.
- Produces (`src/app/actions.ts`, `'use server'`):
  - `type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; error: string }`
  - `getProjectsAction(): Promise<ProjectsResult>`
  - `addProjectAction(projectPath: string): Promise<{ ok: true; path: string; result: ProjectsResult } | { ok: false; error: string }>`
  - `getCatalogAction(update?: boolean): Promise<CatalogResult>`
  - `getInstalledAction(projectPath: string): Promise<InstalledState>`
  - `installSkillsAction(projectPath: string, ids: string[], overwrite?: boolean): Promise<InstallResult[]>`
  - `addUserSkillAction(input: NewUserSkill): Promise<{ ok: true; skillId: string; catalog: CatalogResult } | { ok: false; error: string }>`

- [ ] **Step 1: Создать `catalog/catalog.json`**

```json
{
  "version": 1,
  "categories": [
    { "id": "graphics", "title": "Графика", "order": 1 },
    { "id": "video", "title": "Видео", "order": 2 }
  ],
  "sources": [
    { "id": "samples", "type": "local", "path": "./samples" }
  ],
  "skills": [
    { "id": "sample-palette", "source": "samples", "path": "sample-palette", "category": "graphics" },
    { "id": "sample-icons", "source": "samples", "path": "sample-icons", "category": "graphics" },
    { "id": "sample-storyboard", "source": "samples", "path": "sample-storyboard", "category": "video" },
    { "id": "sample-subtitles", "source": "samples", "path": "sample-subtitles", "category": "video" }
  ]
}
```

- [ ] **Step 2: Создать 4 тестовых скилла**

`catalog/samples/sample-palette/SKILL.md`:
```markdown
---
name: Палитра (пример)
description: Тестовый скилл каталога. Подбирает цветовую палитру для интерфейса.
---

# Палитра (пример)

Тестовый скилл Skill Manager. Замените реальными скиллами в `catalog/catalog.json`.
```

`catalog/samples/sample-icons/SKILL.md`:
```markdown
---
name: Иконки (пример)
description: Тестовый скилл каталога. Подсказывает, как оформлять SVG-иконки.
---

# Иконки (пример)

Тестовый скилл Skill Manager. Замените реальными скиллами в `catalog/catalog.json`.
```

`catalog/samples/sample-storyboard/SKILL.md`:
```markdown
---
name: Раскадровка (пример)
description: Тестовый скилл каталога. Помогает составить раскадровку ролика.
---

# Раскадровка (пример)

Тестовый скилл Skill Manager. Замените реальными скиллами в `catalog/catalog.json`.
```

`catalog/samples/sample-subtitles/SKILL.md`:
```markdown
---
name: Субтитры (пример)
description: Тестовый скилл каталога. Готовит субтитры в формате SRT.
---

# Субтитры (пример)

Тестовый скилл Skill Manager. Замените реальными скиллами в `catalog/catalog.json`.
```

- [ ] **Step 3: Создать `src/app/actions.ts`**

```ts
'use server';

import { CatalogError, loadCatalog } from '@/core/catalog';
import { getInstalled, installSkills } from '@/core/installer';
import { resolveAppPaths } from '@/core/paths';
import { addManualProject, isKnownProject, listProjects, type ProjectsResult } from '@/core/projects';
import type { Catalog, InstallResult, InstalledState } from '@/core/types';
import { addUserSkill, type NewUserSkill } from '@/core/user-catalog';

export type CatalogResult = { ok: true; catalog: Catalog } | { ok: false; error: string };

const appPaths = () => resolveAppPaths();

export async function getProjectsAction(): Promise<ProjectsResult> {
  return listProjects(appPaths());
}

export async function addProjectAction(
  projectPath: string,
): Promise<{ ok: true; path: string; result: ProjectsResult } | { ok: false; error: string }> {
  try {
    const saved = await addManualProject(appPaths(), projectPath);
    return { ok: true, path: saved, result: await listProjects(appPaths()) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getCatalogAction(update = false): Promise<CatalogResult> {
  try {
    return { ok: true, catalog: await loadCatalog(appPaths(), { update }) };
  } catch (e) {
    if (e instanceof CatalogError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function getInstalledAction(projectPath: string): Promise<InstalledState> {
  const paths = appPaths();
  if (!(await isKnownProject(paths, projectPath))) return {};
  const catalog = await loadCatalog(paths);
  return getInstalled(projectPath, catalog.skills);
}

export async function installSkillsAction(
  projectPath: string,
  ids: string[],
  overwrite = false,
): Promise<InstallResult[]> {
  const paths = appPaths();
  if (!(await isKnownProject(paths, projectPath))) {
    return ids.map((skillId) => ({ skillId, status: 'error' as const, message: 'Проект не найден в списке' }));
  }
  const catalog = await loadCatalog(paths);
  return installSkills(projectPath, catalog.skills, ids, { overwrite });
}

export async function addUserSkillAction(
  input: NewUserSkill,
): Promise<{ ok: true; skillId: string; catalog: CatalogResult } | { ok: false; error: string }> {
  try {
    const { skillId } = await addUserSkill(appPaths().userDir, input);
    return { ok: true, skillId, catalog: await getCatalogAction(false) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Временная проверочная страница `src/app/page.tsx`**

```tsx
import { getCatalogAction, getProjectsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, projects] = await Promise.all([getCatalogAction(false), getProjectsAction()]);
  return <pre>{JSON.stringify({ catalog, projects }, null, 2)}</pre>;
}
```

- [ ] **Step 5: Проверить сборку**

Run: `npm run build`
Expected: `✓ Compiled successfully`, код 0.

- [ ] **Step 6: Проверить страницу на живом сервере**

Run (в фоне): `npm run dev`
Затем: `curl.exe -s http://127.0.0.1:4317 | Select-String -Pattern 'sample-palette|"open": true' | Select-Object -First 3`
Expected: в выводе есть `sample-palette` и хотя бы один проект с `"open": true` (папка `interface`, открытая в VS Code). Остановить dev-сервер.

- [ ] **Step 7: Commit**

```powershell
git add catalog src/app/actions.ts src/app/page.tsx
git commit -m "feat(app): sample catalog and server actions`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Глобальные стили, плитка `Tile` и круг `Blob`

> UI-компоненты проверяются сборкой и визуально (скриншот в Task 14) — так зафиксировано в спецификации (раздел 9).

**Files:**
- Modify: `src/app/globals.css` (полная замена)
- Create: `src/components/Tile/Tile.tsx`, `src/components/Tile/Tile.module.css`, `src/components/Blob/Blob.tsx`, `src/components/Blob/shader.ts`, `src/components/Blob/Blob.module.css`

**Interfaces:**
- Produces:
  - `interface TileProps { title: string; hint?: string; marker?: ReactNode; badge?: ReactNode; selected?: boolean; disabled?: boolean; tone?: 'default' | 'success' | 'warning' | 'error'; index?: number; className?: string; style?: CSSProperties; onClick?: () => void; onHover?: () => void }`, `Tile(props)`;
  - `type BlobPulse = 'hover' | 'select' | 'success' | 'error'`, `interface BlobHandle { pulse(kind: BlobPulse): void }`, `Blob({ ref?: Ref<BlobHandle>; className?: string })` — занимает весь родитель (`position: absolute; inset: 0`), радиус капли = 0.36 × меньшей стороны;
  - глобальный класс `.glass-input` для полей ввода.

- [ ] **Step 1: Сверить API Three.js**

Run: `Select-String -Path node_modules/three/package.json -Pattern '"version"'` и убедиться, что `WebGLRenderer`, `ShaderMaterial`, `OrthographicCamera`, `PlaneGeometry`, `Vector2`, `Color` экспортируются: `Select-String -Path node_modules/@types/three/src/Three.Core.d.ts -Pattern 'ShaderMaterial|OrthographicCamera' | Select-Object -First 2`.
Expected: версия 0.186.x, строки найдены.

- [ ] **Step 2: Заменить `src/app/globals.css`**

```css
/* ===== ПЕРЕМЕННЫЕ ===== */
:root {
  --color-bg-1: #12071f;
  --color-bg-2: #3a1060;
  --color-bg-3: #0c1538;
  --color-text: #eef0ff;
  --color-text-dim: rgba(238, 240, 255, 0.62);
  --color-blue: #3d5bff;
  --color-violet: #9d4dff;
  --color-pink: #f070e6;
  --color-success: #5ef2b0;
  --color-warning: #ffd27a;
  --color-error: #ff6b8a;
  --glass-bg: rgba(255, 255, 255, 0.06);
  --glass-bg-hover: rgba(255, 255, 255, 0.11);
  --glass-border: rgba(255, 255, 255, 0.14);
  --glass-blur: 18px;
  --radius-tile: 16px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --font-main: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
}

/* ===== СБРОС ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: none; border: none; cursor: pointer; }
ul { list-style: none; }

/* ===== ГЛОБАЛЬНЫЕ СТИЛИ ===== */
body {
  font-family: var(--font-main);
  color: var(--color-text);
  background-color: var(--color-bg-1);
  background-image:
    radial-gradient(ellipse 70% 80% at 20% 85%, rgba(122, 30, 160, 0.55), transparent 60%),
    radial-gradient(ellipse 60% 70% at 85% 15%, rgba(20, 40, 120, 0.55), transparent 60%),
    linear-gradient(120deg, var(--color-bg-1), var(--color-bg-2) 45%, var(--color-bg-3));
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* Зерно поверх фона, как на референсе */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: 0.07;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}

.glass-input {
  width: 100%;
  padding: 11px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.glass-input::placeholder { color: rgba(238, 240, 255, 0.35); }
.glass-input:focus { border-color: var(--color-violet); box-shadow: 0 0 0 3px rgba(157, 77, 255, 0.25); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Создать `src/components/Tile/Tile.tsx`**

```tsx
'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from './Tile.module.css';

export interface TileProps {
  title: string;
  hint?: string;
  marker?: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'error';
  index?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  onHover?: () => void;
}

export function Tile({
  title, hint, marker, badge, selected = false, disabled = false, tone = 'default',
  index = 0, className, style, onClick, onHover,
}: TileProps) {
  const cls = [
    styles.tile,
    selected && styles['tile--selected'],
    disabled && styles['tile--disabled'],
    tone !== 'default' && styles[`tile--${tone}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      style={{ ...style, '--i': index } as CSSProperties}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={disabled ? undefined : onHover}
    >
      {marker !== undefined && (
        <span className={styles.tile__marker} aria-hidden="true">
          {marker}
        </span>
      )}
      <span className={styles.tile__body}>
        <span className={styles.tile__title}>{title}</span>
        {hint && <span className={styles.tile__hint}>{hint}</span>}
      </span>
      {badge !== undefined && badge !== null && <span className={styles.tile__badge}>{badge}</span>}
    </button>
  );
}
```

- [ ] **Step 4: Создать `src/components/Tile/Tile.module.css`**

Анимация появления использует отдельные свойства `translate`/`scale`, чтобы не перебивать `transform` при hover.

```css
.tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  max-width: 100%;
  padding: 10px 16px;
  border-radius: var(--radius-tile);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: 0 8px 30px rgba(5, 5, 30, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: var(--color-text);
  text-align: left;
  animation: tile-in 0.6s var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 45ms);
  transition: background 0.25s, box-shadow 0.3s, transform 0.25s var(--ease-out);
}

/* Переливающаяся кромка в цветах круга */
.tile::before {
  content: "";
  position: absolute;
  inset: -1px;
  padding: 1px;
  border-radius: inherit;
  background: linear-gradient(120deg, var(--color-blue), var(--color-violet), var(--color-pink), var(--color-blue));
  background-size: 300% 100%;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
  animation: tile-shimmer 6s linear infinite;
}

.tile:not(.tile--disabled):hover {
  background: var(--glass-bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(61, 91, 255, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.tile:not(.tile--disabled):hover::before { opacity: 0.7; }
.tile:not(.tile--disabled):active { transform: scale(0.97); }
.tile:focus-visible { outline: 2px solid var(--color-violet); outline-offset: 2px; }

.tile--selected {
  background: linear-gradient(135deg, rgba(61, 91, 255, 0.3), rgba(157, 77, 255, 0.28));
  box-shadow: 0 10px 34px rgba(157, 77, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.tile--selected::before { opacity: 1; }

.tile--disabled { cursor: default; background: rgba(255, 255, 255, 0.035); }
.tile--disabled .tile__title { color: var(--color-text-dim); }

.tile__marker { flex: none; font-size: 14px; color: var(--color-text-dim); }
.tile--selected .tile__marker { color: var(--color-pink); }
.tile--success .tile__marker { color: var(--color-success); }
.tile--warning .tile__marker { color: var(--color-warning); }
.tile--error .tile__marker { color: var(--color-error); }

.tile__body { display: flex; flex-direction: column; min-width: 0; }
.tile__title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile__hint {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--color-text-dim);
  transition: max-height 0.35s var(--ease-out), opacity 0.3s;
}
.tile:hover .tile__hint { max-height: 54px; opacity: 1; margin-top: 2px; }

.tile__badge {
  flex: none;
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: linear-gradient(120deg, var(--color-violet), var(--color-pink));
}

@keyframes tile-in {
  from { opacity: 0; translate: 0 10px; scale: 0.96; }
  to { opacity: 1; translate: 0 0; scale: 1; }
}
@keyframes tile-shimmer {
  to { background-position: 300% 0; }
}
```

- [ ] **Step 5: Создать `src/components/Blob/shader.ts`**

```ts
export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Стеклянная капля: волнистый край (шум по углу), выпуклость к курсору,
// перелив кромки синий → фиолетовый → розовый, блики и пульсация.
export const fragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uPulse;
  uniform vec3 uPulseColor;
  uniform float uMotion;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 frag = vUv * uResolution;
    vec2 p = (frag - uCenter) / uRadius;
    float ang = atan(p.y, p.x);
    float r = length(p);
    float t = uTime * 0.35 * uMotion;
    vec2 dir = vec2(cos(ang), sin(ang));

    float wave = (noise(dir * 1.8 + t) - 0.5) * 0.10 + (noise(dir * 3.5 - t * 1.3) - 0.5) * 0.05;

    vec2 m = (uMouse - uCenter) / uRadius;
    float mAng = atan(m.y, m.x);
    float dAng = abs(atan(sin(ang - mAng), cos(ang - mAng)));
    float prox = smoothstep(2.2, 0.8, length(m)) * uMotion;
    float bump = exp(-dAng * dAng * 6.0) * 0.06 * prox;

    float edge = 1.0 + wave + bump + uPulse * 0.04 * sin(ang * 6.0 + uTime * 8.0);
    float d = r - edge;
    float aa = 1.5 / uRadius;
    float inside = 1.0 - smoothstep(-aa, aa, d);

    float k = 0.5 + 0.5 * sin(ang + 0.6 + t * 0.5);
    vec3 blue = vec3(0.20, 0.30, 1.00);
    vec3 violet = vec3(0.62, 0.25, 0.95);
    vec3 pink = vec3(0.95, 0.40, 0.90);
    vec3 rimCol = mix(blue, mix(violet, pink, smoothstep(0.5, 1.0, k)), smoothstep(0.0, 0.6, k));
    rimCol = mix(rimCol, uPulseColor, clamp(uPulse, 0.0, 1.0) * 0.6);

    float rim = exp(-abs(d) * 28.0);
    float innerGlow = exp(-max(-d, 0.0) * 6.0) * inside;
    float spec = pow(max(0.0, sin(ang * 3.0 + t * 1.7)), 24.0) * rim;

    vec3 body = mix(vec3(0.08, 0.12, 0.38), vec3(0.11, 0.20, 0.48), clamp(p.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 col = body * inside * 0.9 + rimCol * innerGlow * (0.55 + uPulse * 0.3) + rimCol * rim * 1.1 + vec3(1.0) * spec * 0.6;
    float alpha = clamp(inside * 0.85 + rim, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;
```

- [ ] **Step 6: Создать `src/components/Blob/Blob.tsx`**

```tsx
'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shader';
import styles from './Blob.module.css';

export type BlobPulse = 'hover' | 'select' | 'success' | 'error';

export interface BlobHandle {
  pulse(kind: BlobPulse): void;
}

const PULSES: Record<BlobPulse, { strength: number; color: [number, number, number] }> = {
  hover: { strength: 0.35, color: [0.55, 0.6, 1.0] },
  select: { strength: 0.8, color: [0.75, 0.45, 1.0] },
  success: { strength: 1.2, color: [0.37, 0.95, 0.69] },
  error: { strength: 1.0, color: [1.0, 0.42, 0.54] },
};

export function Blob({ ref, className }: { ref?: Ref<BlobHandle>; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef({ value: 0, color: new THREE.Color(0.75, 0.45, 1.0) });
  const [fallback, setFallback] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      pulse(kind) {
        const p = PULSES[kind];
        pulseRef.current.value = Math.max(pulseRef.current.value, p.strength);
        pulseRef.current.color.setRGB(...p.color);
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 100 },
      uPulse: { value: 0 },
      uPulseColor: { value: new THREE.Color() },
      uMotion: { value: reduced ? 0 : 1 },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false });
    scene.add(new THREE.Mesh(geometry, material));

    const base = new THREE.Vector2();
    const mouse = new THREE.Vector2();
    const target = new THREE.Vector2();
    let hasMouse = false;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(w, h);
      base.set(w / 2, h / 2);
      uniforms.uRadius.value = Math.min(w, h) * 0.36;
      if (!hasMouse) {
        mouse.copy(base);
        uniforms.uCenter.value.copy(base);
        uniforms.uMouse.value.copy(base);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.set(e.clientX - rect.left, rect.height - (e.clientY - rect.top));
      hasMouse = true;
    };
    window.addEventListener('pointermove', onMove);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      uniforms.uTime.value += dt;
      // Параллакс: центр капли слегка тянется к курсору
      target.copy(mouse).sub(base).multiplyScalar(reduced ? 0 : 0.04).add(base);
      uniforms.uCenter.value.lerp(target, 1 - Math.exp(-dt * 4));
      uniforms.uMouse.value.lerp(mouse, 1 - Math.exp(-dt * 8));
      pulseRef.current.value *= Math.exp(-dt * 2.5);
      uniforms.uPulse.value = pulseRef.current.value;
      uniforms.uPulseColor.value.copy(pulseRef.current.color);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  const cls = [styles.blob, fallback && styles['blob--fallback'], className].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.blob__canvas} />
    </div>
  );
}
```

- [ ] **Step 7: Создать `src/components/Blob/Blob.module.css`**

```css
.blob { position: absolute; inset: 0; pointer-events: none; }
.blob__canvas { display: block; width: 100%; height: 100%; }
.blob--fallback {
  background: radial-gradient(circle at 50% 50%, rgba(40, 60, 160, 0.55) 0 34%, rgba(157, 77, 255, 0.6) 35.5%, transparent 37%);
}
.blob--fallback .blob__canvas { display: none; }
```

- [ ] **Step 8: Проверить сборку**

Run: `npm run build`
Expected: `✓ Compiled successfully`, код 0 (компоненты ещё не подключены к странице — проверяется компиляция типов).

- [ ] **Step 9: Commit**

```powershell
git add src/app/globals.css src/components/Tile src/components/Blob
git commit -m "feat(ui): glass tile and animated Three.js blob`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Проекты, кольцо категорий, плитки скиллов, диалог

**Files:**
- Create: `src/components/ProjectList/ProjectList.tsx`, `src/components/ProjectList/ProjectList.module.css`, `src/components/CategoryRing/CategoryRing.tsx`, `src/components/CategoryRing/CategoryRing.module.css`, `src/components/SkillTiles/SkillTiles.tsx`, `src/components/SkillTiles/SkillTiles.module.css`, `src/components/Dialog/Dialog.tsx`, `src/components/Dialog/Dialog.module.css`, `src/components/ErrorScreen/ErrorScreen.tsx`, `src/components/ErrorScreen/ErrorScreen.module.css`

**Interfaces:**
- Consumes: `Tile`, `TileProps` (Task 12); `MY_SKILLS` (Task 10); `Project`, `CategoryDef`, `CatalogSkill`, `InstalledState` (types).
- Produces:
  - `ProjectList({ projects: Project[]; activePath: string | null; error?: string; onSelect(path: string): void; onAddFolder(path: string): Promise<string | null>; onHover(): void })` — `onAddFolder` возвращает текст ошибки или `null`;
  - `CategoryRing({ categories: CategoryDef[]; active: string; counts: Record<string, number>; onSelect(id: string): void; onHover(): void })` — плитки по кругу, последняя — «Мои скиллы» (`MY_SKILLS`). Ожидает CSS-переменную `--ring-radius` у родителя;
  - `SkillTiles({ skills: CatalogSkill[]; selected: string[]; installed: InstalledState; showAdd: boolean; onToggle(id: string): void; onUpdate(id: string): void; onAdd(): void; onHover(): void })` — сетка внутри круга;
  - `Dialog({ title: string; children: ReactNode; onClose(): void })`;
  - `ErrorScreen({ message: string })`.

- [ ] **Step 1: Создать `src/components/ProjectList/ProjectList.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { Project } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './ProjectList.module.css';

interface Props {
  projects: Project[];
  activePath: string | null;
  error?: string;
  onSelect(path: string): void;
  onAddFolder(path: string): Promise<string | null>;
  onHover(): void;
}

export function ProjectList({ projects, activePath, error, onSelect, onAddFolder, onHover }: Props) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const open = projects.filter((p) => p.open);
  const recent = projects.filter((p) => !p.open);

  const submit = async () => {
    const err = await onAddFolder(value);
    if (err) {
      setAddError(err);
      return;
    }
    setAdding(false);
    setValue('');
    setAddError(null);
  };

  const renderTiles = (list: Project[], offset: number) =>
    list.map((p, i) => (
      <Tile
        key={p.path}
        index={offset + i}
        title={p.name}
        hint={p.path}
        marker={p.open ? '●' : '○'}
        tone={p.open ? 'success' : 'default'}
        selected={p.path === activePath}
        onClick={() => onSelect(p.path)}
        onHover={onHover}
      />
    ));

  return (
    <aside className={styles.projects}>
      <h2 className={styles.projects__title}>Открыто в VS Code</h2>
      {open.length > 0 ? (
        <div className={styles.projects__list}>{renderTiles(open, 0)}</div>
      ) : (
        <p className={styles.projects__empty}>{error ?? 'Нет открытых проектов'}</p>
      )}

      {recent.length > 0 && (
        <>
          <h2 className={styles.projects__title}>Недавние</h2>
          <div className={styles.projects__list}>{renderTiles(recent, open.length)}</div>
        </>
      )}

      {adding ? (
        <form
          className={styles.projects__add}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className="glass-input"
            autoFocus
            placeholder="C:\путь\к\проекту"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {addError && <p className={styles.projects__error}>{addError}</p>}
          <div className={styles.projects__row}>
            <Tile title="Добавить" selected onClick={() => void submit()} />
            <Tile
              title="Отмена"
              onClick={() => {
                setAdding(false);
                setAddError(null);
              }}
            />
          </div>
        </form>
      ) : (
        <Tile title="Добавить проект" marker="+" index={projects.length} onClick={() => setAdding(true)} onHover={onHover} />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Создать `src/components/ProjectList/ProjectList.module.css`**

```css
.projects {
  grid-area: projects;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 6px 4px 2px;
  scrollbar-width: thin;
}
.projects__title {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-dim);
}
.projects__list { display: flex; flex-direction: column; gap: 8px; }
.projects__empty { font-size: 13px; color: var(--color-text-dim); }
.projects__add { display: flex; flex-direction: column; gap: 8px; }
.projects__row { display: flex; gap: 8px; }
.projects__error { font-size: 12px; color: var(--color-error); }
```

- [ ] **Step 3: Создать `src/components/CategoryRing/CategoryRing.tsx`**

```tsx
'use client';

import type { CSSProperties } from 'react';
import { MY_SKILLS } from '@/core/selection';
import type { CategoryDef } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './CategoryRing.module.css';

interface Props {
  categories: CategoryDef[];
  active: string;
  counts: Record<string, number>;
  onSelect(id: string): void;
  onHover(): void;
}

export function CategoryRing({ categories, active, counts, onSelect, onHover }: Props) {
  const items = [...categories.map((c) => ({ id: c.id, title: c.title })), { id: MY_SKILLS, title: 'Мои скиллы' }];
  const step = 360 / items.length;

  return (
    <div className={styles.ring}>
      {items.map((c, i) => (
        <div
          key={c.id}
          className={styles.ring__slot}
          style={{ '--angle': `${-90 + i * step}deg` } as CSSProperties}
        >
          <Tile
            index={i}
            title={c.title}
            marker={c.id === MY_SKILLS ? '★' : undefined}
            selected={c.id === active}
            badge={counts[c.id] || undefined}
            onClick={() => onSelect(c.id)}
            onHover={onHover}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/components/CategoryRing/CategoryRing.module.css`**

```css
.ring { position: absolute; inset: 0; pointer-events: none; }
.ring__slot {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: 190px;
  white-space: nowrap;
  pointer-events: auto;
  transform: translate(-50%, -50%) rotate(var(--angle)) translateX(var(--ring-radius)) rotate(calc(-1 * var(--angle)));
}
```

- [ ] **Step 5: Создать `src/components/SkillTiles/SkillTiles.tsx`**

```tsx
'use client';

import type { CatalogSkill, InstalledState } from '@/core/types';
import { Tile, type TileProps } from '../Tile/Tile';
import styles from './SkillTiles.module.css';

interface Props {
  skills: CatalogSkill[];
  selected: string[];
  installed: InstalledState;
  showAdd: boolean;
  onToggle(id: string): void;
  onUpdate(id: string): void;
  onAdd(): void;
  onHover(): void;
}

function tileState(
  skill: CatalogSkill,
  installed: InstalledState,
  isSelected: boolean,
): Pick<TileProps, 'marker' | 'tone' | 'disabled' | 'hint'> {
  if (skill.error) return { marker: '!', tone: 'error', disabled: true, hint: skill.error };
  const status = installed[skill.id];
  if (status === 'up-to-date') return { marker: '✓', tone: 'success', disabled: true, hint: 'Уже установлен в проекте' };
  if (status === 'outdated') return { marker: '↻', tone: 'warning', hint: 'Доступно обновление — нажмите, чтобы обновить' };
  return { marker: isSelected ? '◉' : '○', hint: skill.description || undefined };
}

export function SkillTiles({ skills, selected, installed, showAdd, onToggle, onUpdate, onAdd, onHover }: Props) {
  if (skills.length === 0 && !showAdd) {
    return (
      <div className={styles.skills}>
        <p className={styles.skills__empty}>В этой категории пока нет скиллов</p>
      </div>
    );
  }

  return (
    <div className={styles.skills}>
      {skills.map((s, i) => {
        const isSelected = selected.includes(s.id);
        return (
          <Tile
            key={s.id}
            index={i}
            title={s.title}
            {...tileState(s, installed, isSelected)}
            selected={isSelected}
            badge={s.layer === 'user' ? 'Мой' : undefined}
            onClick={() => (installed[s.id] === 'outdated' ? onUpdate(s.id) : onToggle(s.id))}
            onHover={onHover}
          />
        );
      })}
      {showAdd && (
        <Tile
          index={skills.length}
          title="Добавить скилл"
          marker="+"
          hint="Репозиторий GitHub или папка на компьютере"
          onClick={onAdd}
          onHover={onHover}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Создать `src/components/SkillTiles/SkillTiles.module.css`**

Квадрат, вписанный в круг радиуса 0.36 стороны сцены, ≈ 0.51 стороны — отсюда 52%.

```css
.skills {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52%;
  height: 52%;
  transform: translate(-50%, -50%);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  align-content: safe center;
  gap: 10px;
  padding: 8px;
  overflow-y: auto;
  scrollbar-width: thin;
  mask-image: linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent);
}
.skills__empty {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-dim);
}
```

- [ ] **Step 7: Создать `src/components/Dialog/Dialog.tsx` и `Dialog.module.css`**

`Dialog.tsx`:
```tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import styles from './Dialog.module.css';

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.dialog}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog__panel} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className={styles.dialog__title}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

`Dialog.module.css`:
```css
.dialog {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(8, 4, 24, 0.55);
  backdrop-filter: blur(6px);
  animation: dialog-fade 0.3s both;
}
.dialog__panel {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 26px;
  border-radius: 24px;
  background: rgba(24, 18, 60, 0.78);
  border: 1px solid var(--glass-border);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  animation: dialog-in 0.45s var(--ease-out) both;
}
.dialog__title { margin-bottom: 18px; font-size: 18px; font-weight: 600; }

@keyframes dialog-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dialog-in {
  from { opacity: 0; scale: 0.95; translate: 0 12px; }
  to { opacity: 1; scale: 1; translate: 0 0; }
}
```

- [ ] **Step 8: Создать `src/components/ErrorScreen/ErrorScreen.tsx` и `ErrorScreen.module.css`**

`ErrorScreen.tsx`:
```tsx
import styles from './ErrorScreen.module.css';

export function ErrorScreen({ message }: { message: string }) {
  return (
    <main className={styles.error}>
      <div className={styles.error__panel}>
        <h1 className={styles.error__title}>Каталог не загружен</h1>
        <p className={styles.error__text}>{message}</p>
        <p className={styles.error__hint}>Проверьте файл catalog/catalog.json и перезапустите приложение.</p>
      </div>
    </main>
  );
}
```

`ErrorScreen.module.css`:
```css
.error { display: grid; place-items: center; height: 100vh; padding: 24px; }
.error__panel {
  max-width: 560px;
  padding: 28px;
  border-radius: 24px;
  background: rgba(24, 18, 60, 0.7);
  border: 1px solid rgba(255, 107, 138, 0.4);
  backdrop-filter: blur(20px);
}
.error__title { margin-bottom: 12px; font-size: 20px; }
.error__text { font-family: Consolas, monospace; font-size: 13px; color: var(--color-error); word-break: break-word; }
.error__hint { margin-top: 14px; font-size: 13px; color: var(--color-text-dim); }
```

- [ ] **Step 9: Проверить сборку**

Run: `npm run build`
Expected: `✓ Compiled successfully`, код 0.

- [ ] **Step 10: Commit**

```powershell
git add src/components
git commit -m "feat(ui): project list, category ring, skill tiles, dialog`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Корзина и главный экран — установка и обновление

**Files:**
- Create: `src/components/Cart/Cart.tsx`, `src/components/Cart/Cart.module.css`, `src/components/SkillManager/SkillManager.tsx`, `src/components/SkillManager/SkillManager.module.css`
- Modify: `src/app/page.tsx` (полная замена временной страницы из Task 11)

**Interfaces:**
- Consumes: все Server Actions (Task 11); `Tile` (Task 12); `Blob`, `BlobHandle`, `BlobPulse` (Task 12); `ProjectList`, `CategoryRing`, `SkillTiles`, `Dialog`, `ErrorScreen` (Task 13); `MY_SKILLS`, `countByCategory`, `pruneSelection`, `skillsForCategory`, `toggleSelection`, `summarizeByCategory` (Task 10); `ProjectsResult` (Task 4).
- Produces:
  - `Cart({ project: Project | null; selected: CatalogSkill[]; categories: CategoryDef[]; busy: boolean; onRemove(id: string): void; onClear(): void; onInstall(): void })`;
  - `SkillManager({ initialCatalog: Catalog; initialProjects: ProjectsResult })` — в Task 15 в него добавляется диалог «Добавить скилл».

- [ ] **Step 1: Создать `src/components/Cart/Cart.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { summarizeByCategory } from '@/core/selection';
import type { CatalogSkill, CategoryDef, Project } from '@/core/types';
import { Tile } from '../Tile/Tile';
import styles from './Cart.module.css';

interface Props {
  project: Project | null;
  selected: CatalogSkill[];
  categories: CategoryDef[];
  busy: boolean;
  onRemove(id: string): void;
  onClear(): void;
  onInstall(): void;
}

export function Cart({ project, selected, categories, busy, onRemove, onClear, onInstall }: Props) {
  const [open, setOpen] = useState(false);
  const count = selected.length;
  const canInstall = project !== null && count > 0 && !busy;

  return (
    <footer className={styles.cart}>
      {open && count > 0 && (
        <div className={styles.cart__items}>
          {selected.map((s, i) => (
            <Tile key={s.id} index={i} title={s.title} marker="×" hint="Убрать из выбора" onClick={() => onRemove(s.id)} />
          ))}
          <Tile
            title="Очистить"
            index={count}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          />
        </div>
      )}
      <div className={styles.cart__bar}>
        <button type="button" className={styles.cart__summary} disabled={count === 0} onClick={() => setOpen((o) => !o)}>
          <span className={styles.cart__project}>{project ? `Проект: ${project.name}` : 'Выберите проект слева'}</span>
          <span className={styles.cart__counts}>
            {count > 0 ? `Выбрано: ${summarizeByCategory(selected, categories)} — нажмите, чтобы посмотреть` : 'Отметьте скиллы в круге'}
          </span>
        </button>
        <button type="button" className={styles.cart__install} disabled={!canInstall} onClick={onInstall}>
          {busy ? 'Устанавливаю…' : `Установить${count > 0 ? ` (${count})` : ''}`}
        </button>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Создать `src/components/Cart/Cart.module.css`**

```css
.cart { grid-area: cart; position: relative; }
.cart__items {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 12px);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px;
  border-radius: 20px;
  background: rgba(20, 16, 50, 0.6);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
  animation: cart-up 0.4s var(--ease-out) both;
}
.cart__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 12px 12px 22px;
  border-radius: 22px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur));
}
.cart__summary { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; text-align: left; }
.cart__summary:disabled { cursor: default; }
.cart__project { font-weight: 600; }
.cart__counts { font-size: 13px; color: var(--color-text-dim); }
.cart__install {
  padding: 14px 28px;
  border-radius: 16px;
  font-weight: 600;
  background: linear-gradient(120deg, var(--color-blue), var(--color-violet) 55%, var(--color-pink));
  background-size: 200% 100%;
  box-shadow: 0 10px 30px rgba(157, 77, 255, 0.35);
  transition: background-position 0.5s var(--ease-out), transform 0.2s, opacity 0.2s, box-shadow 0.3s;
}
.cart__install:hover:not(:disabled) {
  background-position: 100% 0;
  transform: translateY(-1px);
  box-shadow: 0 14px 40px rgba(240, 112, 230, 0.4);
}
.cart__install:active:not(:disabled) { transform: scale(0.97); }
.cart__install:disabled { opacity: 0.4; cursor: default; box-shadow: none; }

@keyframes cart-up {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
```

- [ ] **Step 3: Создать `src/components/SkillManager/SkillManager.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCatalogAction,
  addProjectAction,
  getInstalledAction,
  getProjectsAction,
  installSkillsAction,
} from '@/app/actions';
import type { ProjectsResult } from '@/core/projects';
import { countByCategory, MY_SKILLS, pruneSelection, skillsForCategory, toggleSelection } from '@/core/selection';
import type { Catalog, InstallResult, InstalledState } from '@/core/types';
import { Blob, type BlobHandle, type BlobPulse } from '../Blob/Blob';
import { Cart } from '../Cart/Cart';
import { CategoryRing } from '../CategoryRing/CategoryRing';
import { Dialog } from '../Dialog/Dialog';
import { ProjectList } from '../ProjectList/ProjectList';
import { SkillTiles } from '../SkillTiles/SkillTiles';
import { Tile } from '../Tile/Tile';
import styles from './SkillManager.module.css';

interface Notice {
  tone: 'success' | 'error';
  title: string;
  lines: string[];
  hint?: string;
}

const STATUS_TEXT: Record<InstallResult['status'], string> = {
  installed: '✓ установлен',
  'already-installed': '• уже был установлен',
  error: '✗ ошибка',
};

const POLL_MS = 2000;
const NOTICE_MS = 9000;

export function SkillManager({ initialCatalog, initialProjects }: { initialCatalog: Catalog; initialProjects: ProjectsResult }) {
  const blob = useRef<BlobHandle>(null);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [projects, setProjects] = useState(initialProjects);
  const [activePath, setActivePath] = useState<string | null>(
    () => initialProjects.projects.find((p) => p.active)?.path ?? initialProjects.projects[0]?.path ?? null,
  );
  const [category, setCategory] = useState(() => initialCatalog.categories[0]?.id ?? MY_SKILLS);
  const [selected, setSelected] = useState<string[]>([]);
  const [installed, setInstalled] = useState<InstalledState>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);

  const pulse = useCallback((kind: BlobPulse) => blob.current?.pulse(kind), []);
  const hover = useCallback(() => pulse('hover'), [pulse]);

  // Живое обновление списка проектов VS Code
  useEffect(() => {
    const timer = setInterval(() => {
      getProjectsAction().then(setProjects).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activePath === null && projects.projects.length > 0) setActivePath(projects.projects[0].path);
  }, [projects, activePath]);

  const refreshInstalled = useCallback(async (projectPath: string | null) => {
    setInstalled(projectPath ? await getInstalledAction(projectPath) : {});
  }, []);

  useEffect(() => {
    void refreshInstalled(activePath);
  }, [activePath, catalog, refreshInstalled]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const project = projects.projects.find((p) => p.path === activePath) ?? null;
  const counts = useMemo(() => countByCategory(selected, catalog.skills), [selected, catalog.skills]);
  const visible = useMemo(() => skillsForCategory(catalog.skills, category), [catalog.skills, category]);
  const selectedSkills = useMemo(() => catalog.skills.filter((s) => selected.includes(s.id)), [catalog.skills, selected]);
  const titleOf = (id: string) => catalog.skills.find((s) => s.id === id)?.title ?? id;

  const toggle = (id: string) => {
    setSelected((sel) => toggleSelection(sel, id));
    pulse('select');
  };

  const install = async (ids: string[], overwrite: boolean) => {
    if (!activePath || ids.length === 0) return;
    setBusy(true);
    try {
      const results = await installSkillsAction(activePath, ids, overwrite);
      const failed = results.filter((r) => r.status === 'error');
      const done = new Set(results.filter((r) => r.status !== 'error').map((r) => r.skillId));
      setSelected((sel) => sel.filter((id) => !done.has(id)));
      pulse(failed.length > 0 ? 'error' : 'success');
      setNotice({
        tone: failed.length > 0 ? 'error' : 'success',
        title: failed.length > 0 ? `Готово с ошибками (${failed.length})` : `Установлено в «${project?.name ?? activePath}»`,
        lines: results.map((r) => `${titleOf(r.skillId)} — ${STATUS_TEXT[r.status]}${r.message ? `: ${r.message}` : ''}`),
        hint: results.some((r) => r.status === 'installed')
          ? 'Перезапустите сессию Claude Code в этом проекте, чтобы скиллы подхватились.'
          : undefined,
      });
      await refreshInstalled(activePath);
    } catch (e) {
      pulse('error');
      setNotice({ tone: 'error', title: 'Не удалось установить', lines: [(e as Error).message] });
    } finally {
      setBusy(false);
    }
  };

  const refreshCatalog = async () => {
    setRefreshing(true);
    try {
      const res = await getCatalogAction(true);
      if (res.ok) {
        setCatalog(res.catalog);
        setSelected((sel) => pruneSelection(sel, res.catalog.skills));
        pulse(res.catalog.errors.length > 0 ? 'error' : 'success');
      } else {
        pulse('error');
        setNotice({ tone: 'error', title: 'Каталог не обновлён', lines: [res.error] });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const addFolder = async (folder: string): Promise<string | null> => {
    const res = await addProjectAction(folder);
    if (!res.ok) {
      pulse('error');
      return res.error;
    }
    setProjects(res.result);
    setActivePath(res.path);
    pulse('success');
    return null;
  };

  return (
    <div className={styles.app}>
      <header className={styles.app__header}>
        <h1 className={styles.app__logo}>Skill Manager</h1>
        <Tile
          title={refreshing ? 'Обновляю каталог…' : 'Обновить каталог'}
          marker="↻"
          disabled={refreshing}
          onClick={refreshCatalog}
          onHover={hover}
        />
      </header>

      <ProjectList
        projects={projects.projects}
        activePath={activePath}
        error={projects.error}
        onSelect={(p) => {
          setActivePath(p);
          pulse('select');
        }}
        onAddFolder={addFolder}
        onHover={hover}
      />

      <main className={styles.app__main}>
        <div className={styles.stage}>
          <Blob ref={blob} />
          <CategoryRing
            categories={catalog.categories}
            active={category}
            counts={counts}
            onSelect={(id) => {
              setCategory(id);
              pulse('select');
            }}
            onHover={hover}
          />
          <SkillTiles
            key={category}
            skills={visible}
            selected={selected}
            installed={installed}
            showAdd={false}
            onToggle={toggle}
            onUpdate={setUpdateId}
            onAdd={() => undefined}
            onHover={hover}
          />
        </div>
        {catalog.errors.length > 0 && (
          <ul className={styles.app__errors}>
            {catalog.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </main>

      <Cart
        project={project}
        selected={selectedSkills}
        categories={catalog.categories}
        busy={busy}
        onRemove={toggle}
        onClear={() => setSelected([])}
        onInstall={() => void install(selected, false)}
      />

      {notice && (
        <div className={`${styles.notice} ${styles[`notice--${notice.tone}`]}`} role="status" onClick={() => setNotice(null)}>
          <strong className={styles.notice__title}>{notice.title}</strong>
          <ul className={styles.notice__list}>
            {notice.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {notice.hint && <p className={styles.notice__hint}>{notice.hint}</p>}
        </div>
      )}

      {updateId && (
        <Dialog title="Обновить скилл?" onClose={() => setUpdateId(null)}>
          <p className={styles.dialog__text}>
            «{titleOf(updateId)}» в проекте «{project?.name}» отличается от версии в каталоге. Установленная копия будет заменена.
          </p>
          <div className={styles.dialog__actions}>
            <Tile
              title="Обновить"
              marker="↻"
              selected
              onClick={() => {
                const id = updateId;
                setUpdateId(null);
                void install([id], true);
              }}
            />
            <Tile title="Отмена" onClick={() => setUpdateId(null)} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Создать `src/components/SkillManager/SkillManager.module.css`**

```css
.app {
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header header"
    "projects main"
    "cart cart";
  gap: 16px 28px;
  height: 100vh;
  padding: 20px 28px;
}
.app__header { grid-area: header; display: flex; align-items: center; justify-content: space-between; }
.app__logo {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: linear-gradient(90deg, #fff, var(--color-violet));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.app__main { grid-area: main; position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; }
.app__errors {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  gap: 4px;
  max-width: 360px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-error);
  background: rgba(255, 107, 138, 0.08);
  border: 1px solid rgba(255, 107, 138, 0.3);
}

/* Сцена: круг + кольцо категорий + плитки скиллов */
.stage {
  --stage-size: min(72vh, calc(100vw - 520px));
  --ring-radius: calc(var(--stage-size) * 0.47);
  position: relative;
  width: var(--stage-size);
  height: var(--stage-size);
}

.notice {
  position: fixed;
  right: 28px;
  bottom: 110px;
  z-index: 50;
  width: min(420px, calc(100vw - 56px));
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(20, 16, 50, 0.72);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  animation: notice-in 0.5s var(--ease-out) both;
}
.notice--success { border-color: rgba(94, 242, 176, 0.45); }
.notice--error { border-color: rgba(255, 107, 138, 0.5); }
.notice__title { display: block; margin-bottom: 8px; }
.notice__list { display: grid; gap: 4px; font-size: 13px; color: var(--color-text-dim); }
.notice__hint { margin-top: 10px; font-size: 13px; color: var(--color-success); }

.dialog__text { margin-bottom: 18px; line-height: 1.5; color: var(--color-text-dim); }
.dialog__actions { display: flex; gap: 10px; }

@keyframes notice-in {
  from { opacity: 0; translate: 0 16px; }
  to { opacity: 1; translate: 0 0; }
}
```

- [ ] **Step 5: Заменить `src/app/page.tsx`**

```tsx
import { ErrorScreen } from '@/components/ErrorScreen/ErrorScreen';
import { SkillManager } from '@/components/SkillManager/SkillManager';
import { getCatalogAction, getProjectsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [catalog, projects] = await Promise.all([getCatalogAction(false), getProjectsAction()]);
  if (!catalog.ok) return <ErrorScreen message={catalog.error} />;
  return <SkillManager initialCatalog={catalog.catalog} initialProjects={projects} />;
}
```

- [ ] **Step 6: Сборка и тесты**

Run: `npm run build; npm test`
Expected: сборка `✓ Compiled successfully`, все тесты PASS.

- [ ] **Step 7: Визуальная проверка скриншотом**

Run (в фоне): `npm run start`
Затем:
```powershell
& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1600,1000 --virtual-time-budget=4000 --screenshot="$env:TEMP\sm-shot.png" http://127.0.0.1:4317
```
Открыть `$env:TEMP\sm-shot.png` (Read tool) и проверить: тёмный фиолетово-синий фон, светящийся круг в центре, плитки «Графика», «Видео», «Мои скиллы» вокруг, плитки тестовых скиллов внутри, список проектов слева, корзина снизу. Если круга нет — смотреть консоль: тот же запуск с `--enable-logging=stderr --v=0`.

- [ ] **Step 8: Ручная проверка установки (сценарий приёмки)**

С пользователем, в окне `msedge --app=http://127.0.0.1:4317`:
1. Слева выбрать проект (например, `kp`).
2. В «Графике» отметить 2 скилла, в «Видео» — 2; в корзине «Выбрано: Графика 2 · Видео 2».
3. «Установить (4)» → уведомление с 4 строками «✓ установлен», круг вспыхивает зелёным.
4. Проверить: `Get-ChildItem <проект>\.claude\skills` — 4 папки `sample-*`.
5. Плитки этих скиллов показывают «✓».
6. Изменить `catalog/samples/sample-palette/SKILL.md` (добавить строку) → выбрать проект заново → у плитки «↻» → нажать → «Обновить» → «✓».
7. Удалить тестовые папки из проекта и откатить правку SKILL.md: `git checkout catalog/samples/sample-palette/SKILL.md`.

Остановить сервер.

- [ ] **Step 9: Commit**

```powershell
git add src
git commit -m "feat(ui): main screen with cart, install and update flow`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Диалог «Добавить свой скилл»

**Files:**
- Create: `src/components/AddSkillDialog/AddSkillDialog.tsx`, `src/components/AddSkillDialog/AddSkillDialog.module.css`
- Modify: `src/components/SkillManager/SkillManager.tsx`

**Interfaces:**
- Consumes: `addUserSkillAction` (Task 11), `NewUserSkill` (Task 9), `Dialog`, `Tile` (Tasks 12–13).
- Produces: `AddSkillDialog({ categories: CategoryDef[]; onClose(): void; onAdded(catalog: Catalog): void; onError(): void })`.

- [ ] **Step 1: Создать `src/components/AddSkillDialog/AddSkillDialog.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { addUserSkillAction } from '@/app/actions';
import type { Catalog, CategoryDef } from '@/core/types';
import type { NewUserSkill } from '@/core/user-catalog';
import { Dialog } from '../Dialog/Dialog';
import { Tile } from '../Tile/Tile';
import styles from './AddSkillDialog.module.css';

const NEW_CATEGORY = '__new__';

interface Props {
  categories: CategoryDef[];
  onClose(): void;
  onAdded(catalog: Catalog): void;
  onError(): void;
}

export function AddSkillDialog({ categories, onClose, onAdded, onError }: Props) {
  const [kind, setKind] = useState<NewUserSkill['kind']>('git');
  const [location, setLocation] = useState('');
  const [ref, setRef] = useState('');
  const [skillPath, setSkillPath] = useState('');
  const [category, setCategory] = useState(categories[0]?.id ?? NEW_CATEGORY);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const isNew = category === NEW_CATEGORY;
    const res = await addUserSkillAction({
      kind,
      location,
      ref: kind === 'git' ? ref : undefined,
      skillPath,
      category: isNew ? '' : category,
      newCategoryTitle: isNew ? newTitle : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      onError();
      return;
    }
    if (!res.catalog.ok) {
      setError(res.catalog.error);
      onError();
      return;
    }
    onAdded(res.catalog.catalog);
  };

  return (
    <Dialog title="Добавить свой скилл" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={styles.form__row}>
          <Tile title="Репозиторий" hint="Ссылка на GitHub" selected={kind === 'git'} onClick={() => setKind('git')} />
          <Tile title="Папка на компьютере" index={1} selected={kind === 'local'} onClick={() => setKind('local')} />
        </div>

        <label className={styles.form__label}>
          {kind === 'git' ? 'Адрес репозитория' : 'Путь к папке'}
          <input
            className="glass-input"
            autoFocus
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={kind === 'git' ? 'https://github.com/owner/repo' : 'C:\\skills\\my-skill'}
          />
        </label>

        {kind === 'git' && (
          <label className={styles.form__label}>
            Ветка или тег
            <input className="glass-input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="по умолчанию — основная ветка" />
          </label>
        )}

        <label className={styles.form__label}>
          Папка скилла внутри
          <input
            className="glass-input"
            value={skillPath}
            onChange={(e) => setSkillPath(e.target.value)}
            placeholder="skills/my-skill (пусто — корень)"
          />
        </label>

        <span className={styles.form__label}>Категория</span>
        <div className={styles.form__row}>
          {categories.map((c, i) => (
            <Tile key={c.id} index={i} title={c.title} selected={category === c.id} onClick={() => setCategory(c.id)} />
          ))}
          <Tile
            title="Новая категория"
            marker="+"
            index={categories.length}
            selected={category === NEW_CATEGORY}
            onClick={() => setCategory(NEW_CATEGORY)}
          />
        </div>
        {category === NEW_CATEGORY && (
          <input className="glass-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название категории" />
        )}

        {error && <p className={styles.form__error}>{error}</p>}

        <div className={styles.form__actions}>
          <Tile
            title={busy ? 'Добавляю… клонирование может занять время' : 'Добавить'}
            marker="+"
            selected
            disabled={busy}
            onClick={() => void submit()}
          />
          <Tile title="Отмена" onClick={onClose} />
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 2: Создать `src/components/AddSkillDialog/AddSkillDialog.module.css`**

```css
.form { display: flex; flex-direction: column; gap: 14px; }
.form__row { display: flex; flex-wrap: wrap; gap: 8px; }
.form__label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--color-text-dim); }
.form__error { font-size: 13px; color: var(--color-error); }
.form__actions { display: flex; gap: 10px; margin-top: 6px; }
```

- [ ] **Step 3: Подключить диалог в `src/components/SkillManager/SkillManager.tsx`**

3a. Импорт — после строки `import { Blob, type BlobHandle, type BlobPulse } from '../Blob/Blob';` добавить:
```tsx
import { AddSkillDialog } from '../AddSkillDialog/AddSkillDialog';
```

3b. Состояние — после строки `const [updateId, setUpdateId] = useState<string | null>(null);` добавить:
```tsx
  const [adding, setAdding] = useState(false);
```

3c. В `<SkillTiles … />` заменить
```tsx
            showAdd={false}
```
на
```tsx
            showAdd={category === MY_SKILLS}
```
и
```tsx
            onAdd={() => undefined}
```
на
```tsx
            onAdd={() => setAdding(true)}
```

3d. Перед закрывающим `</div>` корневого элемента (после блока `{updateId && (…)}`) добавить:
```tsx
      {adding && (
        <AddSkillDialog
          categories={catalog.categories}
          onClose={() => setAdding(false)}
          onError={() => pulse('error')}
          onAdded={(next) => {
            setCatalog(next);
            setAdding(false);
            setCategory(MY_SKILLS);
            pulse('success');
          }}
        />
      )}
```

- [ ] **Step 4: Сборка и тесты**

Run: `npm run build; npm test`
Expected: сборка успешна, все тесты PASS.

- [ ] **Step 5: Ручная проверка**

`npm run start` → окно Edge → «Мои скиллы» → «Добавить скилл» → «Папка на компьютере» → путь к `catalog\samples\sample-icons` (абсолютный), категория «Новая категория» «Тест» → «Добавить».
Expected: диалог закрылся, в «Мои скиллы» плитка «Иконки (пример)» с бейджем «Мой», в кольце появилась категория «Тест»; `user/user-catalog.json` создан. Затем `git status` — `user/` не показывается (в `.gitignore`). Удалить `user/user-catalog.json` после проверки. Остановить сервер.

- [ ] **Step 6: Commit**

```powershell
git add src/components
git commit -m "feat(ui): add custom skill dialog`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Запуск одной командой, README, финальная проверка

**Files:**
- Create: `scripts/launch.mjs`, `README.md`

**Interfaces:**
- Consumes: npm-скрипты из Task 1.
- Produces: `npm run app` — собирает при отсутствии `.next/BUILD_ID`, запускает сервер на `127.0.0.1:4317`, открывает окно Edge без вкладок.

- [ ] **Step 1: Создать `scripts/launch.mjs`**

```js
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
```

- [ ] **Step 2: Создать `README.md`**

````markdown
# Skill Manager

Локальное приложение: выбираете проект, открытый в VS Code, отмечаете скиллы Claude Code
по категориям и одной кнопкой ставите их в `<проект>/.claude/skills/`.

## Запуск

```powershell
npm install
npm run app
```

`npm run app` при первом запуске собирает приложение и открывает его в отдельном окне.

- Разработка: `npm run dev` → http://127.0.0.1:4317
- Тесты: `npm test`

## Каталог скиллов

| Слой | Файл | Кто меняет |
|---|---|---|
| Базовый | `catalog/catalog.json` | автор приложения, приходит с обновлениями |
| Мой | `user/user-catalog.json` | вы, через «Мои скиллы → Добавить скилл» |

Свой скилл с тем же `id`, что у базового, перекрывает базовый.
Формат манифеста — в [спецификации](docs/superpowers/specs/2026-10-18-skill-manager-mvp-design.md), раздел 4.

## ⚠️ Переустановка

Папки `user/` (ваши скиллы и настройки) и `.cache/` (клоны репозиториев) — в `.gitignore`:
`git pull` их не трогает. Если удаляете папку приложения целиком — сохраните `user/`.

## После установки скиллов

Перезапустите сессию Claude Code в проекте, чтобы новые скиллы подхватились.
````

- [ ] **Step 3: Проверить запуск**

Run: `npm run app`
Expected: в терминале `Skill Manager открыт: http://127.0.0.1:4317`, открылось окно Edge без адресной строки с интерфейсом. Закрыть процесс (Ctrl+C).

- [ ] **Step 4: Финальная проверка (superpowers:verification-before-completion)**

Run: `npm test; npm run build`
Expected: все тесты PASS, сборка успешна. Пройти чеклист раздела 10 спецификации и отметить каждый пункт по фактическим результатам Tasks 2, 14, 15.

- [ ] **Step 5: Commit**

```powershell
git add scripts/launch.mjs README.md
git commit -m "feat: one-command launch and README`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
